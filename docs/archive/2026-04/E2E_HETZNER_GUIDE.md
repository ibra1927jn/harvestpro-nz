# E2E Tests en Hetzner — Guía de uso

## Pre-requisitos en el servidor (una sola vez)

```bash
# En el servidor (95.217.158.7):
# 1. Abrir puerto 9323 en firewall para ver el reporte desde el portátil
ufw allow 9323/tcp

# 2. Asegurar que el repo existe
ls /root/repos/harvestpro-nz
# Si no existe: git clone git@github.com:TU_USUARIO/harvestpro-nz.git /root/repos/harvestpro-nz
```

## Credenciales necesarias (del proyecto mcbtyaebetzvzvnxydpy)

Del dashboard: https://supabase.com/dashboard/project/mcbtyaebetzvzvnxydpy/settings/api

- **VITE_SUPABASE_ANON_KEY** — `anon / public` key
- **SUPABASE_SERVICE_ROLE_KEY** — `service_role` key (solo para seed de usuarios)
- **TELEGRAM_BOT_TOKEN** + **TELEGRAM_CHAT_ID** — opcional para notificaciones

## Formas de correr

### Opción A — Desde el portátil (una línea)
```bash
ssh root@95.217.158.7 \
  "VITE_SUPABASE_URL=https://mcbtyaebetzvzvnxydpy.supabase.co \
   VITE_SUPABASE_ANON_KEY=TU_ANON_KEY \
   SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_KEY \
   TELEGRAM_BOT_TOKEN=TU_BOT_TOKEN \
   TELEGRAM_CHAT_ID=TU_CHAT_ID \
   bash /root/repos/harvestpro-nz/scripts/run-e2e-hetzner.sh"
```

### Opción B — Configurar .env.local en el servidor (recomendado)
```bash
# 1. Crear el .env.local en el servidor con las credenciales correctas
ssh root@95.217.158.7 "cat > /root/repos/harvestpro-nz/.env.local << 'EOF'
VITE_SUPABASE_URL=https://mcbtyaebetzvzvnxydpy.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY_AQUI
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_KEY_AQUI
TELEGRAM_BOT_TOKEN=TU_BOT_TOKEN
TELEGRAM_CHAT_ID=TU_CHAT_ID
TEST_DEMO_PASSWORD=111111
TEST_MANAGER_PASSWORD=111111
TEST_ACID_PASSWORD=AcidTest2026!
EOF"

# 2. Correr el script (sin pasar credenciales por CLI)
ssh root@95.217.158.7 "bash /root/repos/harvestpro-nz/scripts/run-e2e-hetzner.sh"
```

### Opción C — En background (no bloquea el terminal)
```bash
ssh root@95.217.158.7 "nohup bash /root/repos/harvestpro-nz/scripts/run-e2e-hetzner.sh \
  > /tmp/e2e_latest.log 2>&1 &
  echo PID: \$!"

# Ver progreso en vivo:
ssh root@95.217.158.7 "tail -f /tmp/e2e_latest.log"
```

## Ver el reporte HTML

Después de correr, el reporte está disponible en:
```
http://95.217.158.7:9323
```
(Puerto 9323, disponible 30 minutos tras el run)

## Seed de usuarios (si la BD está limpia)

```bash
# Si el servidor ya tiene el .env.local configurado:
ssh root@95.217.158.7 "cd /root/repos/harvestpro-nz && node scripts/seed-users.cjs"

# O pasando la service key directamente:
ssh root@95.217.158.7 \
  "SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_KEY \
   node /root/repos/harvestpro-nz/scripts/seed-users.cjs"
```

## Telegram (opcional)

Si configuras `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`, recibirás:
- Notificación cuando inicia el run
- Resultado final (✅/❌) con conteo de tests
- Lista de tests fallados
- Archivo de log adjunto
