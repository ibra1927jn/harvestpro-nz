<#
.SYNOPSIS
  Copia de seguridad del Supabase local (Docker Desktop) de HarvestPro NZ.

.DESCRIPTION
  Hace pg_dump DENTRO del contenedor de la base (no hace falta instalar
  PostgreSQL en Windows), lo copia a una carpeta con fecha y guarda también
  los archivos de Storage (documentos de RRHH) y un recuento de filas por
  tabla para comprobar luego la restauración. Conserva las 14 últimas copias.
  Solo lee: no para ni toca la base.

  Para programarlo cada día: docs/backups-local.md (Programador de tareas).
  Restaurar / comprobar una copia: scripts/restore-local.ps1

.PARAMETER BackupDir
  Carpeta de las copias. Por defecto %USERPROFILE%\HarvestPro-backups.

.PARAMETER Keep
  Número de copias que se guardan (las más recientes). Por defecto 14.

.PARAMETER DbContainer
  Contenedor de la base. Por defecto el único supabase_db_* en marcha
  (si hay varios, supabase_db_harvestpro-nz).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1
.EXAMPLE
  pwsh scripts/backup-local.ps1 -BackupDir D:\Copias -Keep 30
#>
[CmdletBinding()]
param(
    [string]$BackupDir,
    [ValidateRange(1, 1000)][int]$Keep = 14,
    [string]$DbContainer,
    [string]$StorageContainer
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
if (-not $BackupDir) {
    $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
    $BackupDir = Join-Path $homeDir 'HarvestPro-backups'
}
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$LogFile = Join-Path $BackupDir 'backup.log'

function Write-Log([string]$Message) {
    $line = '{0} [backup] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    # Registro para el Programador de tareas (se ejecuta sin ventana)
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Fail([string]$Message) {
    Write-Log "ERROR: $Message"
    exit 1
}

# Ejecuta docker y falla si docker falla; devuelve la salida como texto
function Invoke-Docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$DockerArgs)
    # En PowerShell 5, con Stop, cualquier línea de stderr de docker sería un error
    $ErrorActionPreference = 'Continue'
    $out = & docker @DockerArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker $($DockerArgs -join ' ') failed: $out" }
    return ($out | Out-String)
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'docker is not installed or not in PATH (is Docker Desktop running?)' }

function Find-DbContainer {
    if ($DbContainer) { return $DbContainer }
    $names = @((Invoke-Docker ps --filter 'name=^supabase_db_' --format '{{.Names}}') -split "`r?`n" | Where-Object { $_ })
    if ($names.Count -eq 1) { return $names[0] }
    if ($names -contains 'supabase_db_harvestpro-nz') { return 'supabase_db_harvestpro-nz' }
    Fail "cannot pick the database container (running: $($names -join ', ')). Is Supabase started? Use -DbContainer."
}

try {
    $db = Find-DbContainer
    if (-not $StorageContainer) { $StorageContainer = $db -replace '^supabase_db_', 'supabase_storage_' }
    Invoke-Docker exec $db psql -X -q -At -U supabase_admin -d postgres -c 'select 1' | Out-Null

    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $target = Join-Path $BackupDir "harvestpro_$stamp"
    $partial = "$target.partial"
    New-Item -ItemType Directory -Force -Path $partial | Out-Null
    $tmpIn = "/tmp/harvestpro_backup_$stamp.dump"

    try {
        Write-Log "Dumping database from $db"
        # Formato custom (-Fc): comprimido y restaurable por partes. Se escribe dentro
        # del contenedor y se copia con docker cp (la tubería de PowerShell 5 rompe binarios).
        Invoke-Docker exec $db pg_dump -U supabase_admin -d postgres -Fc -f $tmpIn | Out-Null
        Invoke-Docker cp "${db}:$tmpIn" (Join-Path $partial 'database.dump') | Out-Null
    }
    finally {
        try { Invoke-Docker exec $db rm -f $tmpIn | Out-Null } catch { Write-Verbose 'temp dump not removed' }
    }
    $dump = Get-Item (Join-Path $partial 'database.dump')
    if ($dump.Length -eq 0) { Fail 'empty dump' }

    # Recuento de filas (public, auth, storage), igual que backup-local.sh
    $countsSql = Get-Content -Raw -Path (Join-Path $Root 'scripts/backup/row-counts.sql')
    $counts = $countsSql | & docker exec -i $db psql -X -q -At -F "`t" -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
    if ($LASTEXITCODE -ne 0) { Fail 'row count query failed' }
    $counts = @($counts | Where-Object { $_ })
    [IO.File]::WriteAllText((Join-Path $partial 'row-counts.tsv'), (($counts -join "`n") + "`n"))

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

    $server = (Invoke-Docker exec $db psql -X -q -At -U supabase_admin -d postgres -c 'show server_version').Trim()
    $manifest = @(
        "created_at=$(Get-Date -Format o)",
        "container=$db",
        "server=$server",
        "dump_bytes=$($dump.Length)",
        "tables=$($counts.Count)"
    )
    [IO.File]::WriteAllText((Join-Path $partial 'manifest.txt'), (($manifest -join "`n") + "`n"))

    # Solo una copia completa lleva el nombre definitivo
    Rename-Item -Path $partial -NewName (Split-Path -Leaf $target)
    $sizeMb = [math]::Round(((Get-ChildItem -Recurse -File $target | Measure-Object -Sum Length).Sum) / 1MB, 1)
    Write-Log "Backup ready: $target ($sizeMb MB, $($counts.Count) tables)"

    # Rotación: los nombres llevan la fecha, orden alfabético = cronológico
    $all = @(Get-ChildItem -Directory -Path $BackupDir |
        Where-Object { $_.Name -match '^harvestpro_\d{4}-\d{2}-\d{2}_\d{6}$' } |
        Sort-Object Name)
    if ($all.Count -gt $Keep) {
        foreach ($old in $all[0..($all.Count - $Keep - 1)]) {
            Write-Log "Removing old backup $($old.Name)"
            Remove-Item -Recurse -Force -LiteralPath $old.FullName
        }
    }
    # Restos de copias interrumpidas de hace más de un día
    Get-ChildItem -Directory -Path $BackupDir -Filter 'harvestpro_*.partial' |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
        ForEach-Object { Remove-Item -Recurse -Force -LiteralPath $_.FullName }

    Write-Output $target
}
catch {
    Fail $_.Exception.Message
}
