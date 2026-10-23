<#
.SYNOPSIS
  Restaura o comprueba una copia hecha con backup-local.ps1 / backup-local.sh.

.DESCRIPTION
  Modo por defecto (comprobar): restaura la copia en una base APARTE del mismo
  contenedor (harvestpro_restore_check), compara el recuento de filas de cada
  tabla con el que se guardó al hacer la copia y borra esa base al terminar.
  La base de la app no se toca.

  -FreshStack (recuperación): tras perder el PC o el volumen de Docker, en un
  Supabase local NUEVO (supabase start, sin datos) carga los datos de public,
  auth y storage y los archivos de Storage. Se niega si ya hay usuarios o huertos.

  Guía: docs/backups-local.md

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup "$env:USERPROFILE\HarvestPro-backups\harvestpro_2026-10-24_020000"
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
    [ValidatePattern('^harvestpro_restore_[a-z0-9_]+$')][string]$CheckDb = 'harvestpro_restore_check'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot

function Write-Log([string]$Message) { Write-Host "[restore] $Message" }
function Fail([string]$Message) { Write-Host "[restore] ERROR: $Message"; exit 1 }

# Función simple (sin param()): así -X, -U, -c... llegan tal cual a docker en $args
# en vez de tomarse como parámetros de PowerShell
function Invoke-Docker {
    # En PowerShell 5, con Stop, cualquier línea de stderr de docker sería un error
    $ErrorActionPreference = 'Continue'
    $dockerArgs = @($args)
    $out = & docker @dockerArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker $($dockerArgs -join ' ') failed: $out" }
    return ($out | Out-String)
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

# supabase_admin es el superusuario de la imagen de Supabase (postgres no lo es)
function Invoke-Sql([string]$Database, [string]$Sql) {
    $out = $Sql | & docker exec -i $db psql -X -q -At -F "`t" -v ON_ERROR_STOP=1 -U supabase_admin -d $Database
    if ($LASTEXITCODE -ne 0) { throw "SQL failed on ${Database}" }
    return @($out | Where-Object { $_ })
}

function Compare-Counts([string]$Database) {
    $expected = @(Get-Content -Path $countsFile | Where-Object { $_ })
    $actual = Invoke-Sql $Database (Get-Content -Raw -Path (Join-Path $Root 'scripts/backup/row-counts.sql'))
    $diff = @(Compare-Object -ReferenceObject $expected -DifferenceObject $actual)
    if ($diff.Count -gt 0) {
        Write-Log 'Row counts differ (<= backup, => restored):'
        $diff | Sort-Object InputObject | ForEach-Object { Write-Host ("  {0} {1}" -f $_.SideIndicator, $_.InputObject) }
        return $false
    }
    $total = ($expected | ForEach-Object { [long]($_ -split "`t")[1] } | Measure-Object -Sum).Sum
    Write-Log "Row counts match: $($expected.Count) tables, $total rows"
    return $true
}

$id = [guid]::NewGuid().ToString('N').Substring(0, 8)
$tmpIn = "/tmp/harvestpro_restore_$id.dump"
$tmpList = "/tmp/harvestpro_restore_$id.list"
$ok = $false
try {
    Invoke-Docker cp $dumpFile "${db}:$tmpIn" | Out-Null

    if (-not $FreshStack) {
        $exists = Invoke-Sql postgres "select count(*) from pg_database where datname = '$CheckDb'"
        if ($exists[0] -ne '0') { Fail "database $CheckDb already exists (a previous check with -Keep?). Drop it first." }
        Write-Log "Restoring into separate database $CheckDb (the app database is not touched)"
        Invoke-Sql postgres "create database $CheckDb" | Out-Null
        try {
            # pg_cron solo existe en la base postgres: se quitan sus entradas de la lista
            Invoke-Docker exec $db sh -c "pg_restore -l '$tmpIn' | grep -v -E ' cron | pg_cron ' > '$tmpList'" | Out-Null
            Invoke-Docker exec $db pg_restore -U supabase_admin -d $CheckDb --exit-on-error -L $tmpList $tmpIn | Out-Null
            $ok = Compare-Counts $CheckDb
        }
        finally {
            if ($Keep) { Write-Log "Kept database $CheckDb" }
            else { Invoke-Sql postgres "drop database $CheckDb" | Out-Null }
        }
        if (-not $ok) { Fail 'restore check FAILED' }
        $storageDir = Join-Path $Backup 'storage'
        if (Test-Path $storageDir) { Write-Log "Storage files in backup: $(@(Get-ChildItem -Recurse -File $storageDir).Count)" }
        Write-Log 'Restore check OK'
        exit 0
    }

    # ── FreshStack ──────────────────────────────────────────────────────────
    $users = (Invoke-Sql postgres 'select count(*) from auth.users')[0]
    $orchards = (Invoke-Sql postgres 'select count(*) from public.orchards')[0]
    if ($users -ne '0' -or $orchards -ne '0') {
        Fail "the database already has data ($users users, $orchards orchards). -FreshStack only loads into a new, empty Supabase."
    }
    # Solo datos (el esquema lo crean las migraciones), sin las tablas de versiones de auth y storage
    Invoke-Docker exec $db sh -c "pg_restore -l '$tmpIn' | grep -E '(TABLE DATA|SEQUENCE SET) (public|auth|storage) ' | grep -v -E ' auth schema_migrations | storage migrations ' > '$tmpList'" | Out-Null
    Write-Log 'Emptying rows created by the migrations'
    Invoke-Sql postgres @'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname IN ('public', 'auth', 'storage')
             AND (n.nspname, c.relname) NOT IN (('auth', 'schema_migrations'), ('storage', 'migrations')) LOOP
    EXECUTE format('TRUNCATE %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;
END $$;
'@ | Out-Null
    Write-Log "Loading data into $db"
    Invoke-Docker exec $db pg_restore -U supabase_admin -d postgres --data-only --disable-triggers --single-transaction --exit-on-error -L $tmpList $tmpIn | Out-Null
    if (-not (Compare-Counts postgres)) { Fail 'restore finished but row counts differ' }
    $storageDir = Join-Path $Backup 'storage'
    if (Test-Path $storageDir) {
        try {
            Invoke-Docker inspect $StorageContainer | Out-Null
            Invoke-Docker cp (Join-Path $storageDir '.') "${StorageContainer}:/mnt/" | Out-Null
            Write-Log "Storage files copied back to $StorageContainer"
        }
        catch { Write-Log "Storage files NOT copied: $($_.Exception.Message)" }
    }
    Write-Log 'Fresh-stack restore OK'
}
catch {
    Fail $_.Exception.Message
}
finally {
    try { Invoke-Docker exec $db rm -f $tmpIn $tmpList | Out-Null } catch { Write-Verbose 'temp files not removed' }
}
