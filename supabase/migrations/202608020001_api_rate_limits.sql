-- ============================================================================
-- 202608020001 — Limitación de tasa (rate limiting) para los endpoints de IA
-- ============================================================================
--
-- QUÉ PROBLEMA RESUELVE
-- ---------------------
-- Antes de esta migración NINGÚN endpoint del proyecto tenía limitación de
-- tasa. Los que llaman a OpenRouter —`/api/chat`, `/api/evaluate`, `/api/tts`,
-- `/api/generate-rubric`, `/api/parse-resume`, `/api/info-chat`— aceptaban
-- peticiones sin sesión y sin tope, así que un bucle de `curl` de una línea
-- consumía el saldo de la cuenta de OpenRouter hasta agotarlo. El coste no es
-- teórico: `/api/chat` envía el prompt completo de la entrevista (rúbrica + CV
-- + historial) en CADA turno, y `/api/tts` sintetiza audio por caracter.
--
-- POR QUÉ EN POSTGRES Y NO EN UPSTASH / REDIS
-- -------------------------------------------
-- Un limitador en memoria del proceso no sirve en Vercel: cada invocación puede
-- caer en una instancia distinta, así que el contador se reinicia y el tope
-- real es «límite × número de instancias», que no está acotado.
--
-- Se descarta Upstash porque exigiría una dependencia nueva y DOS variables de
-- entorno nuevas y obligatorias (`UPSTASH_REDIS_REST_URL`, `..._TOKEN`). Un
-- despliegue que no las configure se queda otra vez sin protección, y esa es
-- exactamente la situación que se está corrigiendo. Postgres ya está
-- configurado, ya es obligatorio para que la aplicación arranque, y el contador
-- que hace falta es un `UPSERT` con incremento atómico: no necesita Redis.
--
-- El coste es una ida y vuelta a la base por petición limitada (~20-50 ms).
-- Para una entrevista conversacional es despreciable frente a los 2-8 s de la
-- llamada al modelo que protege.
--
-- VENTANA FIJA, NO DESLIZANTE
-- ---------------------------
-- Se usa ventana fija (`floor(epoch / window) * window`) y no ventana
-- deslizante. La ventana fija admite una ráfaga de hasta 2× el límite en el
-- cambio de ventana; la deslizante necesitaría guardar una marca de tiempo por
-- petición. Para proteger un presupuesto de API contra abuso, acotar a 2× es
-- suficiente y cuesta una fila por ventana en vez de una por petición.
-- ============================================================================

-- ─── 1. Tabla de contadores ─────────────────────────────────────────────────
--
-- `identifier` NO guarda direcciones IP en claro: el llamante pasa un SHA-256
-- con sal (ver `hashRateLimitIdentifier` en `src/lib/api/rate-limit.ts`). La
-- tabla es material operativo, no un registro de visitantes.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket        TEXT        NOT NULL,
  identifier    TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier, window_start)
);

COMMENT ON TABLE public.api_rate_limits IS
  'Contadores de ventana fija para limitacion de tasa. Solo escribe/lee la funcion consume_rate_limit con service_role. Sin politicas RLS: ningun rol de cliente tiene acceso.';

-- Necesario para que la purga de ventanas caducadas no haga un recorrido
-- completo de la tabla.
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window
  ON public.api_rate_limits (window_start);

-- RLS activo y SIN políticas: `anon` y `authenticated` no pueden leer ni
-- escribir nada. El único acceso es a través de la función de abajo, que corre
-- como `SECURITY DEFINER`, y de `service_role`, que ignora RLS.
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;

-- ─── 2. Consumo atómico de una unidad de cuota ──────────────────────────────
--
-- `SET search_path = ''` sigue la convención que fijó
-- `202607290004_set_function_search_path.sql`: con el `search_path` vacío toda
-- referencia queda cualificada y la función no puede ser secuestrada creando un
-- objeto homónimo en un esquema que preceda a `public`.
--
-- Devuelve SIEMPRE una fila. `allowed = false` significa cuota agotada; el
-- contador se incrementa igual para que el abuso sostenido no se reinicie por
-- el simple hecho de seguir intentándolo dentro de la misma ventana.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket          TEXT,
  p_identifier      TEXT,
  p_limit           INTEGER,
  p_window_seconds  INTEGER
)
RETURNS TABLE (
  allowed    BOOLEAN,
  remaining  INTEGER,
  reset_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_hits         INTEGER;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) = 0
     OR p_identifier IS NULL OR length(p_identifier) = 0 THEN
    RAISE EXCEPTION 'consume_rate_limit requires a non-empty bucket and identifier';
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'consume_rate_limit requires a positive limit and window';
  END IF;

  -- Inicio de la ventana fija que contiene a `now()`.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  -- Incremento atómico. El `ON CONFLICT` resuelve la carrera entre dos
  -- peticiones simultáneas del mismo identificador sin bloqueo explícito.
  INSERT INTO public.api_rate_limits AS l (bucket, identifier, window_start, hits)
  VALUES (p_bucket, p_identifier, v_window_start, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET hits = l.hits + 1
  RETURNING l.hits INTO v_hits;

  -- Purga oportunista: se ejecuta en ~1 % de las llamadas para que la tabla no
  -- crezca sin límite sin depender de `pg_cron`, que no está garantizado en
  -- todos los planes de Supabase. Un día de retención sobra: la ventana más
  -- larga que usa la aplicación es de una hora.
  IF random() < 0.01 THEN
    DELETE FROM public.api_rate_limits
    WHERE window_start < clock_timestamp() - INTERVAL '1 day';
  END IF;

  RETURN QUERY
  SELECT
    v_hits <= p_limit,
    GREATEST(0, p_limit - v_hits),
    v_window_start + make_interval(secs => p_window_seconds);
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) IS
  'Consume una unidad de cuota en una ventana fija y devuelve si se permite la peticion. Solo ejecutable por service_role.';

-- Ningún rol de cliente puede ejecutarla: si `anon` pudiera llamarla, podría
-- agotar la cuota de otro identificador a voluntad (denegación de servicio
-- dirigida) además de sondear el estado del limitador.
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
