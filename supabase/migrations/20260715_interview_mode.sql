-- ============================================================
-- Migración: Interview Mode para roles
-- restricted = flujo completo con hardware check, pantalla y fullscreen
-- internal = flujo rápido sin screen share ni fullscreen
-- ============================================================

ALTER TABLE public.roles
ADD COLUMN IF NOT EXISTS interview_mode TEXT;

UPDATE public.roles
SET interview_mode = 'restricted'
WHERE interview_mode IS NULL;

ALTER TABLE public.roles
ALTER COLUMN interview_mode SET DEFAULT 'restricted';

ALTER TABLE public.roles
ALTER COLUMN interview_mode SET NOT NULL;

ALTER TABLE public.roles
DROP CONSTRAINT IF EXISTS roles_interview_mode_check;

ALTER TABLE public.roles
ADD CONSTRAINT roles_interview_mode_check
CHECK (interview_mode IN ('restricted', 'internal'));

CREATE INDEX IF NOT EXISTS idx_roles_interview_mode
ON public.roles(interview_mode);

COMMENT ON COLUMN public.roles.interview_mode IS
'Modo de entrevista: restricted = verificación completa + screen share/fullscreen; internal = flujo rápido sin verificación ni pantalla completa, grabando cámara y micrófono.';
