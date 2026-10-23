# Copias de seguridad locales (Supabase en Docker)

La app vive en el ordenador del dueño (Windows + Docker Desktop, `supabase start`). Si el disco o el
volumen de Docker se pierden, se pierden huertos, fichajes, cubetas y nóminas. Estas copias lo evitan.

## Qué guarda cada copia

Una carpeta `harvestpro_AAAA-MM-DD_HHMMSS` con:

| Archivo | Qué es |
|---|---|
| `database.dump` | `pg_dump` de toda la base (formato comprimido de PostgreSQL) |
| `row-counts.tsv` | filas de cada tabla de `public`, `auth` y `storage` en el momento de la copia |
| `storage/` | los archivos subidos (documentos de RRHH, fotos de QC, adjuntos del chat) |
| `manifest.txt` | fecha, contenedor, versión de PostgreSQL y tamaño |

Se guardan las **14 últimas**; las anteriores se borran solas. Las copias llevan datos personales de los
trabajadores (contratos, documentos, horas y pagos): la carpeta de copias no se comparte ni se sube al repo
(`/backups/` está en `.gitignore`). Lo ideal es que esté en otro disco o en una carpeta sincronizada
privada (OneDrive personal, disco USB) para que sobreviva si el PC se estropea.

El `pg_dump` se ejecuta dentro del contenedor de la base: no hace falta instalar PostgreSQL en Windows.
Solo lee; la app puede estar en uso mientras se hace la copia (tarda unos segundos).

## Hacer una copia a mano

PowerShell (Windows), desde la carpeta del proyecto, con Docker Desktop y Supabase en marcha:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1
# otra carpeta u otro número de copias
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -BackupDir D:\HarvestPro-backups -Keep 30
```

Por defecto van a `%USERPROFILE%\HarvestPro-backups`, con un registro en `backup.log` dentro de esa carpeta.

Linux / macOS / WSL: `scripts/backup-local.sh` (carpeta `./backups`, o `BACKUP_DIR=... KEEP=...`).

## Programarla cada día (Programador de tareas de Windows)

1. Abre **Programador de tareas** (Inicio → escribe «Programador de tareas»).
2. **Acción → Crear tarea…** (no «tarea básica», para poder elegir las opciones de abajo).
3. Pestaña **General**:
   - Nombre: `HarvestPro backup`.
   - Marca **Ejecutar solo cuando el usuario haya iniciado sesión** (Docker Desktop corre en tu sesión).
4. Pestaña **Desencadenadores → Nuevo…**: **Diariamente**, a una hora en que el PC suele estar encendido
   y la app sin uso (por ejemplo 21:00). Aceptar.
5. Pestaña **Acciones → Nueva…**:
   - Programa: `powershell.exe`
   - Argumentos: `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\ruta\a\harvestpro-nz\scripts\backup-local.ps1"`
     (cambia la ruta por la de tu carpeta del proyecto; añade `-BackupDir "D:\HarvestPro-backups"` si quieres otra carpeta)
   - Iniciar en: `C:\ruta\a\harvestpro-nz`
6. Pestaña **Condiciones**: desmarca **Iniciar la tarea solo si el equipo está conectado a la corriente**
   si es un portátil.
7. Pestaña **Configuración**: marca **Ejecutar la tarea lo antes posible si no se ejecutó a la hora
   programada** (si el PC estaba apagado a esa hora, la copia se hace al encenderlo).
8. Aceptar. Para probarla: clic derecho en la tarea → **Ejecutar**, y mira que aparezca una carpeta nueva
   y una línea `Backup ready` en `backup.log`.

Lo mismo desde PowerShell (una sola vez; cambia la ruta):

```powershell
$proj = 'C:\ruta\a\harvestpro-nz'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $proj `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$proj\scripts\backup-local.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 21:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'HarvestPro backup' -Action $action -Trigger $trigger -Settings $settings
```

Si Docker Desktop no está abierto a esa hora, la copia falla y lo deja escrito en `backup.log`
(`ERROR: cannot pick the database container`). Activa en Docker Desktop **Start Docker Desktop when you
sign in** y arranca Supabase (`supabase start`) al empezar el día.

## Comprobar que una copia sirve (sin tocar la app)

Una copia que nunca se ha probado no es una copia. Una vez al mes (o tras cambiar de versión de Supabase):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup "$env:USERPROFILE\HarvestPro-backups\harvestpro_2026-10-24_210000"
```

Restaura la copia en una base aparte (`harvestpro_restore_check`) del mismo contenedor, compara las filas
de cada tabla con `row-counts.tsv` y borra esa base. La base de la app no se toca. Termina con
`Restore check OK` o con la lista de tablas que no cuadran. Con `-Keep` deja la base para mirarla.

Linux / WSL: `scripts/restore-local.sh <carpeta de la copia> [--keep]`.

La CI de GitHub hace lo mismo en cada PR (trabajo `edge-functions`): copia con los dos scripts (bash y
PowerShell), comprueba la restauración y hace una recuperación completa en un Supabase vacío.

## Recuperar los datos tras perder el PC o el volumen de Docker

1. Instala Docker Desktop, Node y el proyecto (mismo commit o posterior al de la copia).
2. `supabase start` (base nueva, solo con las migraciones; **no** ejecutes los seeds).
3. Carga la copia más reciente:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup <carpeta> -FreshStack
   ```
   Se niega si la base ya tiene usuarios o huertos (para no mezclar datos). Carga los datos de `public`,
   `auth` (cuentas y contraseñas) y `storage`, copia los archivos al contenedor de Storage y comprueba
   los recuentos.
4. Entra en la app con una cuenta de siempre y revisa el último día con datos.

Si la copia es de una versión anterior de la app, aplica primero las mismas migraciones que tenía
entonces (o restaura en un checkout de esa fecha), y después actualiza con normalidad.
