-- =============================================================================
-- Historial de filas por equipo
--
-- Cada asignación de fila queda guardada con su equipo (team leader) y la hora
-- en que entró y salió. Así el manager y el team leader ven el recorrido del
-- día: «fila 1 → 4 → 6 → ahora 10».
--   status 'active'    → el equipo está ahí ahora
--   status 'moved'     → el equipo se fue a otra fila (ended_at = cuándo)
--   status 'completed' → la fila se terminó (ended_at = cuándo)
-- Antes, al reasignar, la fila anterior se borraba y no quedaba rastro.
-- =============================================================================

ALTER TABLE public.row_assignments
    ADD COLUMN IF NOT EXISTS team_leader_id uuid,
    ADD COLUMN IF NOT EXISTS ended_at timestamptz;

COMMENT ON COLUMN public.row_assignments.team_leader_id IS
  'Equipo (id del team leader: pickers.id o users.id) al que se asignó la fila.';
COMMENT ON COLUMN public.row_assignments.ended_at IS
  'Cuándo dejó el equipo la fila (movida a otra o terminada). NULL mientras está activa.';

ALTER TABLE public.row_assignments DROP CONSTRAINT IF EXISTS row_assignments_status_check;
ALTER TABLE public.row_assignments
    ADD CONSTRAINT row_assignments_status_check CHECK (status IN ('active', 'moved', 'completed'));

ALTER TABLE public.row_assignments ALTER COLUMN assigned_at SET DEFAULT now();

-- Equipo de las asignaciones existentes: el team leader que esté entre los
-- asignados o, si no, el team leader del primer picker.
UPDATE public.row_assignments ra
SET team_leader_id = COALESCE(
    (SELECT p.id FROM public.pickers p
      WHERE p.id = ANY (ra.assigned_pickers) AND p.role = 'team_leader' LIMIT 1),
    (SELECT p.team_leader_id FROM public.pickers p
      WHERE p.id = ANY (ra.assigned_pickers) AND p.team_leader_id IS NOT NULL LIMIT 1)
)
WHERE ra.team_leader_id IS NULL;

-- Las completadas antes de esta migración: fin = última modificación
UPDATE public.row_assignments
SET ended_at = COALESCE(updated_at, assigned_at)
WHERE status = 'completed' AND ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_row_assignments_history
    ON public.row_assignments (orchard_id, team_leader_id, assigned_at DESC);
