# Copias de seguridad locales (Supabase en Docker)

La app vive en el ordenador del dueño (Windows + Docker Desktop, `supabase start`). Si el disco o el
volumen de Docker se pierden, se pierden huertos, fichajes, cubetas y nóminas. Estas copias lo evitan.

## Qué guarda cada copia

Una carpeta `harvestpro_AAAA-MM-DD_HHMMSS` con:

| Archivo | Qué es |
|---|---|
| `database.dump` | `pg_dump` de toda la base (formato comprimido de PostgreSQL) |
| `row-counts.tsv` | filas de cada tabla de `public`, `auth` y `storage` |
| `orphans.tsv` | filas huérfanas (claves foráneas que apuntan a nada); vacío si todo está bien |
| `migrations.tsv` | migraciones aplicadas a la base (versión del esquema de la copia) |
| `sanity.txt` | resultado de la comprobación de la copia (ver «Copias sospechosas») |
| `storage/` | los archivos subidos (documentos de RRHH, fotos de QC, adjuntos del chat) |
| `secrets/` | **secretos**: los de Vault que usa el push (`vault.tsv`: `push_project_url`, `push_service_role_key`), `env.local` (copia de `.env.local`), `functions.env` (copia de `supabase/functions/.env`, con la clave VAPID **privada**) y `env` si hay `.env` |
| `manifest.txt` | fecha, contenedor, versión de PostgreSQL, tamaño y última migración |

El recuento, las huérfanas y las migraciones se toman **en la misma instantánea que el dump**
(`pg_export_snapshot` + `pg_dump --snapshot`): cuadran aunque la app esté en uso mientras se copia
(cubetas, renovación de sesiones, la bandeja de push que pg_cron vacía cada minuto).

Se guardan las **14 últimas**; las anteriores se borran solas. Las copias llevan datos personales de los
trabajadores (contratos, documentos, horas y pagos), las contraseñas cifradas de las cuentas y, en
`secrets/`, las claves del servidor: la carpeta de copias no se comparte ni se sube al repo (`/backups/`
está en `.gitignore`).

El `pg_dump` se ejecuta dentro del contenedor de la base: no hace falta instalar PostgreSQL en Windows.
Solo lee; la app puede estar en uso mientras se hace la copia (tarda unos segundos). La lógica es la misma
en Windows y en Linux: `scripts/backup/container-dump.sh` y `container-restore.sh` corren dentro del
contenedor y los `.ps1` / `.sh` solo los lanzan.

## Una segunda copia fuera del PC (recomendado)

Si el disco del PC se rompe o lo roban, una copia en el mismo disco no sirve. Pasa `-MirrorDir` con una
carpeta en **otro disco**, un **USB** o una carpeta **privada de OneDrive**: cada copia buena se copia
también allí (con las mismas 14 últimas).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -MirrorDir "E:\HarvestPro-backups"
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -MirrorDir "$env:OneDrive\HarvestPro-backups"
```

Si la carpeta no está disponible (USB desconectado), la copia principal se hace igual, se apunta el error en
`backup.log` y el script sale con código 3.

## Hacer una copia a mano

PowerShell (Windows), desde la carpeta del proyecto, con Docker Desktop y Supabase en marcha:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1
# otra carpeta u otro número de copias (rutas relativas: respecto a la carpeta actual)
powershell -ExecutionPolicy Bypass -File scripts\backup-local.ps1 -BackupDir D:\HarvestPro-backups -Keep 30
```

Por defecto van a `%USERPROFILE%\HarvestPro-backups`, con un registro en `backup.log` dentro de esa carpeta.

Linux / macOS / WSL: `scripts/backup-local.sh` (carpeta `./backups`, o `BACKUP_DIR=... KEEP=... MIRROR_DIR=...`).

## Copias sospechosas: no se borra nada

Antes de borrar copias viejas se mira la nueva. Si `users` u `orchards` salen vacías, o una tabla clave
(`auth.users`, `users`, `orchards`, `pickers`, `bucket_records`, `daily_attendance`) tiene **menos de la
mitad** de filas que en la copia anterior, la copia nueva se guarda como `harvestpro_<fecha>.suspect`,
**no se borra ninguna vieja** y el script sale con código 2 y el motivo en `backup.log`. Así un borrado por
error no se lleva por delante las copias buenas en dos semanas.

Si los datos son así de verdad (por ejemplo, una instalación nueva o se vació una temporada a propósito),
repite con `-Force` (`FORCE=1` en Linux). Las carpetas `.suspect` no cuentan para la rotación: bórralas a
mano cuando ya no las quieras.

## Filas huérfanas

Si la base tiene filas que apuntan a algo que ya no existe (por ejemplo `auth.mfa_amr_claims` o
`auth.refresh_tokens` de sesiones borradas), la copia se hace igual y completa, y tanto la copia como la
comprobación lo avisan así:

```
WARNING: orphan rows ...
  auth.mfa_amr_claims: 61 row(s) whose (session_id) is not in auth.sessions  [mfa_amr_claims_session_id_fkey]
```

No es un fallo de la copia, pero conviene limpiarlas en la base de la app (borrar esas filas) para que no
den guerra al restaurar. La comprobación las restaura igual que estaban.

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
   - Argumentos: `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\ruta\a\harvestpro-nz\scripts\backup-local.ps1" -MirrorDir "E:\HarvestPro-backups"`
     (cambia las rutas; quita `-MirrorDir` si no tienes otro disco)
   - Iniciar en: `C:\ruta\a\harvestpro-nz`
6. Pestaña **Condiciones**: desmarca **Iniciar la tarea solo si el equipo está conectado a la corriente**
   si es un portátil.
7. Pestaña **Configuración**: marca **Ejecutar la tarea lo antes posible si no se ejecutó a la hora
   programada** (si el PC estaba apagado a esa hora, la copia se hace al encenderlo).
8. Aceptar. Para probarla: clic derecho en la tarea → **Ejecutar**, y mira que aparezca una carpeta nueva
   y una línea `Backup ready` en `backup.log`.

Lo mismo desde PowerShell (una sola vez; cambia las rutas):

```powershell
$proj = 'C:\ruta\a\harvestpro-nz'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $proj `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$proj\scripts\backup-local.ps1`" -MirrorDir `"E:\HarvestPro-backups`""
$trigger = New-ScheduledTaskTrigger -Daily -At 21:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'HarvestPro backup' -Action $action -Trigger $trigger -Settings $settings
```

Si Docker Desktop no está abierto a esa hora, la copia falla y lo deja escrito en `backup.log`
(`ERROR: cannot pick the database container`). Activa en Docker Desktop **Start Docker Desktop when you
sign in** y arranca Supabase (`supabase start`) al empezar el día. Mira `backup.log` de vez en cuando:
cualquier `ERROR` (copia sospechosa, segunda copia sin disco) aparece ahí.

## Comprobar que una copia sirve (sin tocar la app)

Una copia que nunca se ha probado no es una copia. Una vez al mes (o tras cambiar de versión de Supabase):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup "$env:USERPROFILE\HarvestPro-backups\harvestpro_2026-10-24_210000"
```

Restaura la copia en una base aparte (`harvestpro_restore_check`) del mismo contenedor, compara las filas
de cada tabla con `row-counts.tsv`, avisa de filas huérfanas y borra esa base. La base de la app no se
toca. Termina con `Restore check OK` o con la lista de tablas que no cuadran. Con `-Keep` deja la base
para mirarla.

Linux / WSL: `scripts/restore-local.sh <carpeta de la copia> [--keep]`.

La CI de GitHub lo prueba en cada PR (trabajo `edge-functions`): copia con bash mientras se escribe en la
base y con PowerShell (rutas relativas y segunda copia), comprobación con una fila huérfana, una copia
sospechosa que no rota, y recuperación completa en un Supabase vacío, también de una copia hecha con un
esquema anterior.

## Recuperar los datos tras perder el PC o el volumen de Docker

1. Instala Docker Desktop, Node, la CLI de Supabase y el proyecto (`git clone`; el commit actual o uno
   posterior al de la copia).
2. `supabase start` (base nueva, solo con las migraciones; **no** ejecutes los seeds).
3. Carga la copia más reciente:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\restore-local.ps1 -Backup <carpeta> -FreshStack
   ```
   - Se niega si la base ya tiene usuarios o huertos (para no mezclar datos).
   - Si la copia es de un esquema **anterior** al del proyecto (migraciones más nuevas desde entonces),
     deja la base vacía en la versión de la copia (`supabase db reset --version`), carga los datos y
     después aplica las migraciones que faltan (`supabase migration up`). Si la copia tiene migraciones que
     el proyecto no tiene, para y pide actualizar el proyecto (`git pull`).
   - Carga `public`, `auth` (cuentas y contraseñas) y `storage`, copia los archivos al contenedor de
     Storage, comprueba recuentos y huérfanas.
   - Repone los secretos de Vault del push si faltan y avisa con un recuadro `WARNING` si siguen faltando
     (sin ellos el push no lo despierta pg_cron: ver `docs/push-notifications.md`).
   - Si en el proyecto no hay `.env.local` o `supabase/functions/.env`, los repone desde `secrets/`.
     Reinicia después Supabase (`supabase stop && supabase start`) para que las funciones lean la clave
     VAPID, y el servidor de la app.
4. Entra en la app con una cuenta de siempre y revisa el último día con datos.
