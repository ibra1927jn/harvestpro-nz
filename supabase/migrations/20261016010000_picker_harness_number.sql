-- =============================================================================
-- Número de arnés de cada persona (pickers.harness_number)
--
-- La pantalla de equipo del team leader y el alta de picker piden un "Harness
-- No." distinto del Picker ID, pero la columna no existía: el número se perdía
-- sin aviso (la app mostraba el Picker ID en su lugar).
-- Quién puede cambiarlo lo deciden las políticas de pickers que ya existen
-- (team leader: su equipo; RRHH/admin: todos).
-- =============================================================================

ALTER TABLE public.pickers ADD COLUMN IF NOT EXISTS harness_number text;

COMMENT ON COLUMN public.pickers.harness_number IS
  'Número del arnés (bolsa de recogida) que lleva la persona. Distinto de picker_id.';
