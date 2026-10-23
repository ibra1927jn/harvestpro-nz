<#
.SYNOPSIS
  Copia de seguridad del Supabase local (Docker Desktop) de HarvestPro NZ.

.DESCRIPTION
  pg_dump DENTRO del contenedor de la base (no hace falta instalar PostgreSQL
  en Windows), con el recuento de filas, las filas huérfanas y las versiones
  de migración tomados en la MISMA instantánea que el dump
  (scripts/backup/container-dump.sh, la misma lógica que backup-local.sh).
  Guarda también los archivos de Storage y los secretos (Vault, .env.local,
  supabase/functions/.env) en secrets\. Conserva las 14 últimas copias.

  Antes de borrar copias viejas comprueba la nueva: si la base sale vacía o
  una tabla clave tiene menos de la mitad de filas que en la copia anterior,
  la guarda como .suspect, NO borra ninguna vieja y sale con código 2.

  Solo lee: no para ni toca la base. Guía: docs/backups-local.md

.PARAMETER BackupDir
  Carpeta de las copias. Por defecto %USERPROFILE%\HarvestPro-backups.

.PARAMETER MirrorDir
  Segunda copia en otro disco, USB o carpeta de OneDrive (recomendado).

.PARAMETER Keep
  Número de copias que se guardan (las más recientes). Por defecto 14.

.PARAMETER Force
  Acepta una copia que parece sospechosa (por ejemplo una instalación nueva, vacía).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -MirrorDir E:\HarvestPro-backups
#>
[CmdletBinding()]
param(
    [string]$BackupDir,
    [string]$MirrorDir,
    [ValidateRange(1, 1000)][int]$Keep = 14,
    [switch]$Force,
    [string]$DbContainer,
    [string]$StorageContainer
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
# Rutas relativas respecto a la carpeta actual (PowerShell 5 y .NET no siempre coinciden)
function Get-FullPath([string]$Path) { $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path) }
if (-not $BackupDir) {
    $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
    $BackupDir = Join-Path $homeDir 'HarvestPro-backups'
}
$BackupDir = Get-FullPath $BackupDir
if ($MirrorDir) { $MirrorDir = Get-FullPath $MirrorDir }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$LogFile = Join-Path $BackupDir 'backup.log'

function Write-Log([string]$Message) {
    $line = '{0} [backup] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    # Registro para el Programador de tareas (se ejecuta sin ventana)
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Fail([string]$Message, [int]$Code = 1) {
    Write-Log "ERROR: $Message"
    exit $Code
}

# Función simple (sin param()): así -X, -U, -c... llegan tal cual a docker en $args
# en vez de tomarse como parámetros de PowerShell
function Invoke-Docker {
    # En PowerShell 5, con Stop, cualquier línea de stderr de docker sería un error
    $ErrorActionPreference = 'Continue'
    $dockerArgs = @($args)
    $out = & docker @dockerArgs 2>&1
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "docker $($dockerArgs -join ' ') failed: $text" }
    return $text
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'docker is not installed or not in PATH (is Docker Desktop running?)' }

function Find-DbContainer {
    if ($DbContainer) { return $DbContainer }
    $names = @((Invoke-Docker ps --filter 'name=^supabase_db_' --format '{{.Names}}') -split "`r?`n" | Where-Object { $_ })
    if ($names.Count -eq 1) { return $names[0] }
    if ($names -contains 'supabase_db_harvestpro-nz') { return 'supabase_db_harvestpro-nz' }
    Fail "cannot pick the database container (running: $($names -join ', ')). Is Supabase started? Use -DbContainer."
}

function Get-Backups([string]$Dir) {
    @(Get-ChildItem -Directory -Path $Dir -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^harvestpro_\d{4}-\d{2}-\d{2}_\d{6}$' } |
        Sort-Object Name)
}

function Invoke-Rotation([string]$Dir) {
    $all = Get-Backups $Dir
    if ($all.Count -gt $Keep) {
        foreach ($old in $all[0..($all.Count - $Keep - 1)]) {
            Write-Log "Removing old backup $($old.FullName)"
            Remove-Item -Recurse -Force -LiteralPath $old.FullName
        }
    }
    # Restos de copias interrumpidas de hace más de un día
    Get-ChildItem -Directory -Path $Dir -Filter 'harvestpro_*.partial' |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
        ForEach-Object { Remove-Item -Recurse -Force -LiteralPath $_.FullName }
}

try {
    $db = Find-DbContainer
    if (-not $StorageContainer) { $StorageContainer = $db -replace '^supabase_db_', 'supabase_storage_' }
    Invoke-Docker exec $db psql -X -q -At -U supabase_admin -d postgres -c 'select 1' | Out-Null

    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $target = Join-Path $BackupDir "harvestpro_$stamp"
    $partial = "$target.partial"
    New-Item -ItemType Directory -Force -Path (Join-Path $partial 'secrets') | Out-Null
    $work = "/tmp/harvestpro_backup_$stamp"

    try {
        Invoke-Docker exec $db mkdir -p $work | Out-Null
        foreach ($f in 'container-dump.sh', 'row-counts.sql', 'orphans.sql') {
            Invoke-Docker cp (Join-Path $Root "scripts/backup/$f") "${db}:$work/$f" | Out-Null
        }
        $prev = Get-Backups $BackupDir | Select-Object -Last 1
        if ($prev -and (Test-Path (Join-Path $prev.FullName 'row-counts.tsv'))) {
            Invoke-Docker cp (Join-Path $prev.FullName 'row-counts.tsv') "${db}:$work/prev-counts.tsv" | Out-Null
        }
        Write-Log "Dumping database from $db (one snapshot for dump and counts)"
        Invoke-Docker exec $db bash "$work/container-dump.sh" $work | Out-Null
        # docker cp: la tubería de PowerShell 5 rompería el dump binario
        Invoke-Docker cp "${db}:$work/out/." $partial | Out-Null
    }
    finally {
        try { Invoke-Docker exec $db bash "$work/container-dump.sh" cleanup $work | Out-Null } catch { Write-Verbose 'work dir not removed' }
    }
    $dump = Get-Item (Join-Path $partial 'database.dump')
    if ($dump.Length -eq 0) { Fail 'empty dump' }
    Move-Item (Join-Path $partial 'vault.tsv') (Join-Path $partial 'secrets\vault.tsv')

    # Secretos que no están en la base: claves de la app y la VAPID privada de las funciones
    foreach ($pair in @(@('.env.local', 'env.local'), @('.env', 'env'), @('supabase/functions/.env', 'functions.env'))) {
        $src = Join-Path $Root $pair[0]
        if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src (Join-Path $partial "secrets\$($pair[1])") }
    }

    # Archivos de Storage (están en el volumen del contenedor, no en la base)
    $hasStorage = $true
    try { Invoke-Docker inspect $StorageContainer | Out-Null } catch { $hasStorage = $false }
    if ($hasStorage) {
        Write-Log "Copying Storage files from $StorageContainer"
        Invoke-Docker cp "${StorageContainer}:/mnt/." (Join-Path $partial 'storage') | Out-Null
    }
    else {
        Write-Log "No Storage container ${StorageContainer}: skipping files"
    }

    $counts = @(Get-Content (Join-Path $partial 'row-counts.tsv') | Where-Object { $_ })
    $migrations = @(Get-Content (Join-Path $partial 'migrations.tsv') | Where-Object { $_ })
    $server = (Get-Content (Join-Path $partial 'server.txt') -Raw).Trim()
    Remove-Item (Join-Path $partial 'server.txt')
    $manifest = @(
        "created_at=$(Get-Date -Format o)",
        "container=$db",
        "server=$server",
        "dump_bytes=$($dump.Length)",
        "tables=$($counts.Count)",
        "migration=$(if ($migrations.Count) { $migrations[-1] })"
    )
    [IO.File]::WriteAllText((Join-Path $partial 'manifest.txt'), (($manifest -join "`n") + "`n"))

    $orphans = @(Get-Content (Join-Path $partial 'orphans.tsv') | Where-Object { $_ })
    if ($orphans.Count -gt 0) {
        Write-Log 'WARNING: the database has orphan rows (the backup is still complete):'
        foreach ($o in $orphans) {
            $c = $o -split "`t"
            Write-Log ("  {0}: {3} row(s) whose ({1}) is not in {2}  [{4}]" -f $c[0], $c[1], $c[2], $c[3], $c[4])
        }
    }

    # Copia sospechosa: no se rota nada
    $sanity = @(Get-Content (Join-Path $partial 'sanity.txt'))
    if (($sanity -notcontains 'status=ok') -and -not $Force) {
        Rename-Item -Path $partial -NewName "harvestpro_$stamp.suspect"
        Write-Log 'ERROR: this backup looks wrong, so NO old backup was deleted:'
        $sanity | Where-Object { $_ -like 'reason=*' } | ForEach-Object { Write-Log ('  ' + $_.Substring(7)) }
        Write-Log "It is kept as harvestpro_$stamp.suspect. Check the app; if the data is really like this, run again with -Force."
        exit 2
    }

    # Solo una copia completa lleva el nombre definitivo
    Rename-Item -Path $partial -NewName (Split-Path -Leaf $target)
    $sizeMb = [math]::Round(((Get-ChildItem -Recurse -File $target | Measure-Object -Sum Length).Sum) / 1MB, 1)
    Write-Log "Backup ready: $target ($sizeMb MB, $($counts.Count) tables)"
    Invoke-Rotation $BackupDir

    # Segunda copia en otro disco / USB / OneDrive
    if ($MirrorDir) {
        try {
            New-Item -ItemType Directory -Force -Path $MirrorDir | Out-Null
            $mirrorPartial = Join-Path $MirrorDir "harvestpro_$stamp.partial"
            Copy-Item -Recurse -LiteralPath $target -Destination $mirrorPartial
            Rename-Item -Path $mirrorPartial -NewName (Split-Path -Leaf $target)
            Write-Log "Second copy: $(Join-Path $MirrorDir (Split-Path -Leaf $target))"
            Invoke-Rotation $MirrorDir
        }
        catch {
            Write-Log "ERROR: could not write the second copy to $MirrorDir (is the drive connected?): $($_.Exception.Message)"
            Write-Output $target
            exit 3
        }
    }

    Write-Output $target
}
catch {
    Fail $_.Exception.Message
}
