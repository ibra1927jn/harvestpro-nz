-- =============================================================================
-- SOLO PC DE DESARROLLO: apaga el 2FA exigido por el servidor.
--
-- Pareja del flag del cliente VITE_MFA_ENFORCE=false (.env.local): con los dos
-- apagados, manager / admin / payroll / RRHH entran solo con contraseña.
-- NUNCA en una instalación real.
--
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/dev-disable-mfa.sql
--
-- Volver a exigirlo: scripts/dev-enable-mfa.sql
-- =============================================================================
INSERT INTO public.security_settings (id, enforce_mfa, updated_at) VALUES (true, false, now())
ON CONFLICT (id) DO UPDATE SET enforce_mfa = false, updated_at = now();

SELECT 'server-side 2FA enforcement: ' || CASE WHEN enforce_mfa THEN 'ON' ELSE 'OFF (dev only)' END AS status
FROM public.security_settings;
