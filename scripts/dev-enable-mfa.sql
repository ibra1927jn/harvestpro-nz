-- =============================================================================
-- Vuelve a exigir 2FA en el servidor (lo normal; cada instalación nueva lo
-- trae encendido). Con esto encendido, quita también VITE_MFA_ENFORCE=false
-- del .env.local, o la app no pedirá el código y las cuentas privilegiadas
-- no verán datos.
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/dev-enable-mfa.sql
-- =============================================================================
INSERT INTO public.security_settings (id, enforce_mfa, updated_at) VALUES (true, true, now())
ON CONFLICT (id) DO UPDATE SET enforce_mfa = true, updated_at = now();

SELECT 'server-side 2FA enforcement: ' || CASE WHEN enforce_mfa THEN 'ON' ELSE 'OFF (dev only)' END AS status
FROM public.security_settings;
