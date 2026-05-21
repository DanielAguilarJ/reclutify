-- ============================================================
-- Migración 00005: Agregar columna interview_duration a roles
-- Permite configurar la duración de la entrevista en minutos
-- para controlar el ritmo de la IA entrevistadora (Zara)
-- ============================================================

ALTER TABLE roles ADD COLUMN IF NOT EXISTS interview_duration INTEGER DEFAULT 30;

-- Comentario en la columna para documentación
COMMENT ON COLUMN roles.interview_duration IS 'Duración de la entrevista en minutos. Default: 30. Usado por Zara para controlar el ritmo y número de preguntas por tema.';
