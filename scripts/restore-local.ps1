<#
.SYNOPSIS
  Restaura o comprueba una copia hecha con backup-local.ps1 / backup-local.sh.

.DESCRIPTION
  Misma lógica que restore-local.sh (scripts/backup/container-restore.sh dentro
  del contenedor de la base).

  Por defecto (comprobar): restaura la copia en una base APARTE
  (harvestpro_restore_check), compara el recuento de cada tabla con el de la
  copia, avisa de filas huérfanas y borra esa base. La base de la app no se toca.

  -FreshStack (recuperación): tras perder el PC o el volumen de Docker, en un
  Supabase local NUEVO (supabase start, sin datos) carga los datos de public,
  auth y storage, los archivos de Storage y los secretos de Vault. Se niega si
  ya hay usuarios o huertos. Si la copia es de un esquema anterior, deja la
  base en la versión de la copia (supabase db reset --version), carga y aplica
  después las migraciones que faltan (supabase migration up).

  Guía: docs/backups-local.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup "$env:USERPROFILE\HarvestPro-backups\harvestpro_2026-10-24_210000"
.EXAMPLE
  pwsh scripts/restore-local.ps1 -Backup <carpeta> -FreshStack
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Backup,
    [switch]$Keep,
    [switch]$FreshStack,
    [string]$DbContainer,
    [string]$StorageContainer,
    [string]$SupabaseCli,
    [ValidatePattern('^harvestpro_restore_[a-z0-9_]+$')][string]$CheckDb = 'harvestpro_restore_check'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
# Rutas relativas respecto a la carpeta actual
$Backup = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Backup)

function Write-Log([string]$Message) { Write-Host "[restore] $Message" }
function Fail([string]$Message) { Write-Host "[restore] ERROR: $Message"; exit 1 }

# Función simple (sin param()): -X, -U, -c... llegan tal cual a docker en $args
function Invoke-Docker {
    # En PowerShell 5, con Stop, cualquier línea de stderr de docker sería un error
    $ErrorActionPreference = 'Continue'
    $dockerArgs = @($args)
    $out = & docker @dockerArgs 2>&1
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "docker $($dockerArgs -join ' ') failed: $text" }
    return $text
}

# Como Invoke-Docker pero enseña la salida (los avisos del script del contenedor) y devuelve el código
function Invoke-DockerShown {
    $ErrorActionPreference = 'Continue'
    $dockerArgs = @($args)
    & docker @dockerArgs 2>&1 | ForEach-Object { Write-Host "$_" }
    return $LASTEXITCODE
}

$dumpFile = Join-Path $Backup 'database.dump'
$countsFile = Join-Path $Backup 'row-counts.tsv'
if (-not ((Test-Path $dumpFile) -and (Test-Path $countsFile))) { Fail "$Backup is not a backup folder (database.dump + row-counts.tsv)" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'docker is not installed or not in PATH' }

if (-not $DbContainer) {
    $names = @((Invoke-Docker ps --filter 'name=^supabase_db_' --format '{{.Names}}') -split "`r?`n" | Where-Object { $_ })
    if ($names.Count -eq 1) { $DbContainer = $names[0] }
    elseif ($names -contains 'supabase_db_harvestpro-nz') { $DbContainer = 'supabase_db_harvestpro-nz' }
    else { Fail "cannot pick the database container (running: $($names -join ', ')). Use -DbContainer." }
}
$db = $DbContainer
if (-not $StorageContainer) { $StorageContainer = $db -replace '^supabase_db_', 'supabase_storage_' }
$work = "/tmp/harvestpro_restore_$([guid]::NewGuid().ToString('N').Substring(0, 8))"

function Invoke-Sql([string]$Sql) {
    (Invoke-Docker exec -e 'PGOPTIONS=-c client_min_messages=warning' $db psql -X -q -At -U supabase_admin -d postgres -c $Sql).Trim()
}

function Copy-Work {
    Invoke-Docker exec $db mkdir -p $work | Out-Null
    foreach ($f in 'container-restore.sh', 'row-counts.sql', 'orphans.sql') {
        Invoke-Docker cp (Join-Path $Root "scripts/backup/$f") "${db}:$work/$f" | Out-Null
    }
    Invoke-Docker cp $dumpFile "${db}:$work/database.dump" | Out-Null
    Invoke-Docker cp $countsFile "${db}:$work/row-counts.tsv" | Out-Null
    $vault = Join-Path $Backup 'secrets/vault.tsv'
    if (Test-Path $vault) { Invoke-Docker cp $vault "${db}:$work/vault.tsv" | Out-Null }
}

function Invoke-SupabaseCli {
    $cliArgs = @($args)
    $ErrorActionPreference = 'Continue'
    Push-Location $Root
    try {
        if ($SupabaseCli) { & $SupabaseCli @cliArgs }
        elseif (Get-Command supabase -ErrorAction SilentlyContinue) { & supabase @cliArgs }
        else { & npx --yes supabase @cliArgs }
        if ($LASTEXITCODE -ne 0) { throw "supabase $($cliArgs -join ' ') failed" }
    }
    finally { Pop-Location }
}

try {
    if (-not $FreshStack) {
        Copy-Work
        Write-Log "Restoring into separate database $CheckDb (the app database is not touched)"
        $code = Invoke-DockerShown exec -e "CHECK_DB=$CheckDb" -e "KEEP_DB=$(if ($Keep) { 1 } else { 0 })" $db bash "$work/container-restore.sh" check $work
        if ($code -ne 0) { Fail 'restore check FAILED' }
        $storageDir = Join-Path $Backup 'storage'
        if (Test-Path $storageDir) { Write-Log "Storage files in backup: $(@(Get-ChildItem -Recurse -File $storageDir).Count)" }
        Write-Log 'Restore check OK'
        exit 0
    }

    # ── FreshStack ──────────────────────────────────────────────────────────
    if ((Invoke-Sql 'select count(*) from auth.users') -ne '0' -or (Invoke-Sql 'select count(*) from public.orchards') -ne '0') {
        Fail 'the database already has data. -FreshStack only loads into a new, empty Supabase.'
    }

    # Versión del esquema: la de la copia frente a la de esta base y a las migraciones del checkout
    $migratedDown = $false
    $migrationsFile = Join-Path $Backup 'migrations.tsv'
    if ((Test-Path $migrationsFile) -and (Get-Item $migrationsFile).Length -gt 0) {
        $backupVersions = @(Get-Content $migrationsFile | Where-Object { $_ } | Sort-Object)
        $backupMax = $backupVersions[-1]
        $localVersions = @(Get-ChildItem (Join-Path $Root 'supabase/migrations') -Filter '*.sql' | ForEach-Object { ($_.Name -split '_')[0] })
        $missingHere = @($backupVersions | Where-Object { $localVersions -notcontains $_ })
        if ($missingHere.Count -gt 0) {
            Fail "the backup has migrations this checkout does not have ($($missingHere -join ', ')). Update the project (git pull) and try again."
        }
        $targetMax = Invoke-Sql 'select max(version) from supabase_migrations.schema_migrations'
        if ([string]::CompareOrdinal($targetMax, $backupMax) -gt 0) {
            Write-Log "The backup is from schema $backupMax; this database is at $targetMax."
            Write-Log "Resetting the empty database to $backupMax, then loading, then applying the newer migrations"
            Invoke-SupabaseCli db reset --local --no-seed --version $backupMax
            for ($i = 0; $i -lt 60; $i++) {
                try { Invoke-Sql 'select 1' | Out-Null; break } catch { Start-Sleep -Seconds 2 }
            }
            $migratedDown = $true
        }
    }
    else {
        Write-Log 'WARNING: old backup without migrations.tsv: loading into the current schema as is'
    }

    Copy-Work
    $code = Invoke-DockerShown exec $db bash "$work/container-restore.sh" fresh $work
    $storageDir = Join-Path $Backup 'storage'
    if (Test-Path $storageDir) {
        try {
            Invoke-Docker inspect $StorageContainer | Out-Null
            Invoke-Docker cp (Join-Path $storageDir '.') "${StorageContainer}:/mnt/" | Out-Null
            Write-Log "Storage files copied back to $StorageContainer"
        }
        catch { Write-Log "WARNING: Storage files NOT copied: $($_.Exception.Message)" }
    }
    if ($code -ne 0) { Fail 'data loaded but the check found problems (above)' }

    if ($migratedDown) {
        Write-Log 'Applying the migrations newer than the backup'
        Invoke-SupabaseCli migration up --local
    }

    # Secretos fuera de la base: se reponen solo si faltan en este checkout
    foreach ($pair in @(@('env.local', '.env.local'), @('functions.env', 'supabase/functions/.env'))) {
        $src = Join-Path $Backup "secrets/$($pair[0])"
        $dst = Join-Path $Root $pair[1]
        if ((Test-Path $src) -and -not (Test-Path $dst)) {
            Copy-Item $src $dst
            Write-Log "Restored $($pair[1]) from the backup (restart Supabase / the dev server to pick it up)"
        }
        elseif (-not (Test-Path $dst)) {
            Write-Log "WARNING: $($pair[1]) is missing and the backup has no copy: see .env.example / docs/push-notifications.md"
        }
    }
    Write-Log 'Fresh-stack restore OK'
}
catch {
    Fail $_.Exception.Message
}
finally {
    try { Invoke-Docker exec $db bash "$work/container-restore.sh" cleanup $work | Out-Null } catch { Write-Verbose 'work dir not removed' }
}
