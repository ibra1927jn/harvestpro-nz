-- =============================================================================
-- Inspección de calidad con criterios (revisión por roles 2026-10-21, punto 15)
--
-- Hasta ahora qc_inspections guardaba una sola nota (grade A/B/C/reject) con
-- notas y foto. La inspección pasa a tener seis criterios de cómo recoge la
-- persona (escaleras, daño al árbol, fruta en el suelo, llenado de cubeta,
-- calibre, fruta dañada), una puntuación 0-100 calculada de ellos, la fila
-- donde se inspeccionó y dos preguntas de bienestar que van aparte de la nota.
--
-- `grade` se mantiene NOT NULL: todo lo que ya la consume (perfil del picker,
-- insignias de riesgo, estadísticas, avisos) sigue igual. Las columnas nuevas
-- son opcionales: una inspección solo con nota sigue siendo válida.
--
-- RLS: no cambia. Las políticas existentes (lectura por huerto; alta por QC,
-- manager y admin) cubren las columnas nuevas. Las respuestas de bienestar se
-- filtran en la app (team leader, manager, RRHH y admin); el cliente ya puede
-- leer la fila entera por huerto, así que esconderlas por columna sería un
-- cambio aparte (vista o privilegios por columna), fuera de este punto.
-- =============================================================================

ALTER TABLE public.qc_inspections
    ADD COLUMN IF NOT EXISTS criteria jsonb,
    ADD COLUMN IF NOT EXISTS score integer CHECK (score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS row_number integer,
    ADD COLUMN IF NOT EXISTS informed boolean,
    ADD COLUMN IF NOT EXISTS comfortable boolean,
    ADD COLUMN IF NOT EXISTS wellbeing_notes text;

COMMENT ON COLUMN public.qc_inspections.criteria IS
  'Criterios marcados por el inspector, cada uno "ok" | "warn" | "bad": '
  '{"ladder":"ok|warn|bad","tree_damage":...,"fruit_on_ground":...,"bucket_fill":...,"size":...,"damaged_fruit":...}. '
  'Puede faltar cualquier clave (criterio sin marcar). NULL = inspección solo con nota (formato anterior). '
  'La nota (grade) se calcula de aquí en la app (todo ok = A; 1 warn = B; 1 bad o 2+ warn = C; 2+ bad o ladder bad = reject) y el inspector puede cambiarla antes de guardar.';

COMMENT ON COLUMN public.qc_inspections.score IS
  'Puntuación 0-100 calculada de criteria (cada criterio marcado pesa igual: ok=100, warn=50, bad=0; ladder bad fuerza 0). NULL si no se marcaron criterios.';

COMMENT ON COLUMN public.qc_inspections.row_number IS
  'Fila en la que estaba la persona al inspeccionarla (pickers.current_row). Los criterios de fila (daño al árbol, fruta en el suelo) se apuntan al picker inspeccionado y aquí queda la fila.';

COMMENT ON COLUMN public.qc_inspections.informed IS
  'Pregunta a la persona: ¿sabe qué variedad / calibre recoge y cómo? NULL = sin respuesta. Bienestar: no entra en la nota ni en las estadísticas de calidad.';

COMMENT ON COLUMN public.qc_inspections.comfortable IS
  'Pregunta a la persona: ¿está a gusto en el equipo? NULL = sin respuesta. Bienestar: no entra en la nota ni en las estadísticas de calidad.';

COMMENT ON COLUMN public.qc_inspections.wellbeing_notes IS
  'Comentario corto de las preguntas de bienestar (informed / comfortable). Solo lo ven team leader, manager, RRHH y admin.';
