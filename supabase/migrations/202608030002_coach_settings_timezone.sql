-- ============================================================================
-- coach_settings: zona horaria
-- ============================================================================
--
-- POR QUÉ
--
-- `/coach/settings` ofrecía un selector de zona horaria que no guardaba nada:
-- vivía en un `useState` local que `handleSave` no miraba, y `coach_settings` no
-- tenía dónde ponerlo. El usuario lo cambiaba, guardaba, recargaba, y volvía a
-- «Ciudad de México».
--
-- Se añade aquí y no en `organizations` porque es una preferencia de la
-- configuración del coach, igual que `default_session_duration`, y sigue el
-- mismo camino de guardado que el resto de esa pantalla.
--
-- El valor por defecto reproduce el que el selector ya usaba, para que las filas
-- existentes no cambien de comportamiento al aplicar la migración.
-- ============================================================================

ALTER TABLE public.coach_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Mexico_City';

COMMENT ON COLUMN public.coach_settings.timezone IS
  'Zona horaria de la organizacion del coach, en formato IANA. La usa la interfaz para presentar fechas. Por defecto America/Mexico_City, que es el valor que el selector ya mostraba.';

-- ============================================================================
-- VERIFICACIÓN MANUAL
-- ============================================================================
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'coach_settings' AND column_name = 'timezone';
--
-- Esperado: `text`, con defecto `'America/Mexico_City'::text` y NOT NULL.
-- ============================================================================
