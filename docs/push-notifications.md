# Notificaciones push

Avisos que llegan al móvil aunque la app esté cerrada. Desde la migración
`20261023060000_push_notifications_outbox.sql`.

## Cómo funciona

```
evento en la base (inspección, aviso, transporte, ausencia, mensaje, rechazo de nómina)
  └─ trigger → notification_outbox (a quién, tipo, parámetros)        ← ningún cliente escribe aquí
       └─ send-push {action:"flush"} → Web Push (VAPID) → service worker → notificación
            ↑ lo despierta el cliente que escribió (services/pushKick.ts)
            ↑ y pg_cron cada minuto (push_outbox_tick, si Vault está configurado)
```

| Evento | Quién recibe | Casilla de Ajustes que lo silencia |
|---|---|---|
| QC rechaza o marca un criterio «bad» | team leader del picker y managers del huerto | Rechazos de QC |
| Aviso del manager (broadcast) | sus destinatarios (`target_roles`; vacío = todos) | — |
| Solicitud de transporte nueva | logística del huerto | Transporte |
| Transporte asignado / completado | quien lo pidió | Transporte |
| Nómina rechaza una hoja de horas | team leader del picker (y el picker si tiene cuenta) | Fichajes |
| Ausencia aprobada / rechazada | quien la pidió | — |
| Mensaje de chat (incluida la petición de corrección de horas del runner) | participantes (`conversations.participant_ids`), menos quien escribe y quien silenció la conversación; nunca con el texto | — |

- Nunca se avisa a quien hizo el cambio, a cuentas desactivadas ni a quien no tiene un dispositivo suscrito.
- Las casillas de tipos son por dispositivo (`push_subscriptions.muted_types`) y las aplica `send-push`.
- El texto se escribe en el idioma de quien lo recibe (`users.preferred_locale`; en, es, fr) en
  `supabase/functions/_shared/push-messages.ts`.
- Un mensaje de chat no se muestra si la app está abierta y a la vista (`public/sw-push.js`).
- Pendientes sin enviar más de 2 días y enviados de más de 7 días se borran solos (`push_outbox_tick`).

## Suscripción en el móvil

«Notificaciones» en **Mi cuenta** (todos los roles) y en **Ajustes** del manager: pide permiso al tocar el
interruptor, suscribe con `VITE_VAPID_PUBLIC_KEY` y guarda la suscripción (una fila por dispositivo, con
`register_push_subscription`). Se borra al desactivar y al cerrar sesión, y se renueva al entrar si el
navegador la cambió.

- **iPhone / iPad**: solo con la app instalada en la pantalla de inicio (Safari 16.4 o posterior): Compartir →
  Añadir a pantalla de inicio. La pantalla lo dice.
- En `npm run dev` no hay service worker: el push solo funciona con la app construida (`vite build` + `vite preview`).

## Claves VAPID (una vez por instalación)

Genera el par (P-256; la privada en PKCS#8, que es lo que lee `_shared/web-push.ts`):

```bash
deno eval '
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  console.log("VAPID_PUBLIC_KEY=" + b64u(await crypto.subtle.exportKey("raw", k.publicKey)));
  console.log("VAPID_PRIVATE_KEY=" + b64u(await crypto.subtle.exportKey("pkcs8", k.privateKey)));
'
```

(No sirve `npx web-push generate-vapid-keys`: da la privada en bruto, no en PKCS#8.)

Dónde va cada una:

1. Edge Functions (secretos):
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:soporte@tu-empresa.nz
   ```
   En local: en `supabase/functions/.env` (no se commitea) o con `scripts/dev-edge-runtime.sh`, que pone
   unas de prueba.
2. Cliente: `VITE_VAPID_PUBLIC_KEY=<la misma pública>` en el `.env` del build.

La privada nunca va al cliente ni al repositorio. Si se cambian las claves, todos los dispositivos tienen
que volver a activar «Notificaciones» (las suscripciones viejas fallan y se borran).

## pg_cron (reintentos y avisos que nadie despertó)

La migración instala `pg_cron` y `pg_net` (si existen) y programa `push-outbox-flush` cada minuto.
Para que despierte a `send-push` necesita dos secretos en Vault:

```sql
select vault.create_secret('https://<proyecto>.supabase.co', 'push_project_url');
select vault.create_secret('<service_role key>', 'push_service_role_key');
```

En local el contenedor de la base llega a la API por la red de Docker (p. ej.
`http://supabase_kong_harvestpro-nz:8000`). Sin estos secretos el trabajo solo limpia la bandeja y los avisos
salen cuando el cliente que escribió despierta `send-push`.

## Probar a mano

1. Claves puestas (arriba), `vite build && vite preview`, entra como team leader en Chrome y activa
   «Notificaciones» en Mi cuenta (debe decir «Activadas en este dispositivo…»).
2. Cierra la pestaña. Desde otra sesión, como QC, guarda una inspección con un criterio en «mal».
3. Llega «QC: <nombre>»; al tocarla se abre `/team-leader`.
4. `select type, sent_at, last_error from notification_outbox order by created_at desc limit 5;`
