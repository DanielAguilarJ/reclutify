-- ============================================================================
-- hashtags y post_hashtags: cerrar las escrituras desde el cliente
-- ============================================================================
--
-- LO QUE HABÍA
--
-- `20260513_hashtags.sql:18-21` creó tres políticas de escritura sin ninguna
-- condición:
--
--     CREATE POLICY "hashtags_insert"      ON hashtags      FOR INSERT TO authenticated WITH CHECK (true);
--     CREATE POLICY "hashtags_update"      ON hashtags      FOR UPDATE TO authenticated USING (true);
--     CREATE POLICY "post_hashtags_insert" ON post_hashtags FOR INSERT TO authenticated WITH CHECK (true);
--
-- Consecuencias, todas con solo tener una cuenta:
--
--  1. `post_hashtags_insert` no comprueba de quién es la publicación, así que
--     cualquiera puede colgar cualquier etiqueta de la publicación de otra
--     persona. Su publicación aparece entonces en el feed de esa etiqueta, y
--     quien la escribió no lo eligió ni puede deshacerlo: no hay política de
--     DELETE, tampoco para el autor.
--
--  2. `hashtags_update USING (true)` permite modificar CUALQUIER fila de
--     `hashtags`, incluidas `post_count` —que ordena las tendencias, y el índice
--     `idx_hashtags_count` existe justo para eso— y `tag`, que es el texto de la
--     etiqueta para todo el mundo.
--
--  3. `hashtags_insert WITH CHECK (true)` permite crear filas con el
--     `post_count` que se quiera, sin haber publicado nada.
--
-- POR QUÉ SE PUEDEN QUITAR SIN ROMPER NADA
--
-- Ninguna de las tres se usa. Las etiquetas las mantiene íntegramente el
-- disparador `process_post_hashtags`, que se ejecuta `AFTER INSERT OR UPDATE OF
-- content ON posts` y es `SECURITY DEFINER`, así que no pasa por RLS: extrae las
-- etiquetas del contenido, inserta en `hashtags` con `ON CONFLICT DO UPDATE`, y
-- vincula en `post_hashtags`.
--
-- Es decir: las etiquetas se derivan del texto de la publicación, y la
-- autorización real es la de `posts` —`posts_owner_insert` y
-- `posts_owner_update`, que sí comprueban el autor—. El cliente nunca necesitó
-- escribir en estas dos tablas, así que las políticas eran superficie de ataque
-- sin ningún uso legítimo detrás.
--
-- LA LECTURA NO SE TOCA
--
-- `hashtags_select` y `post_hashtags_select` son `USING (true)` para
-- `authenticated`, y está bien: las etiquetas son vocabulario compartido y su
-- asociación con las publicaciones es lo que hace funcionar la búsqueda por
-- etiqueta. No hay nada por organización ni por persona que filtrar, y `anon` no
-- alcanza ninguna de las dos.
-- ============================================================================

DROP POLICY IF EXISTS "hashtags_insert" ON public.hashtags;
DROP POLICY IF EXISTS "hashtags_update" ON public.hashtags;
DROP POLICY IF EXISTS "post_hashtags_insert" ON public.post_hashtags;

COMMENT ON TABLE public.hashtags IS
  'Vocabulario de etiquetas derivado del contenido de las publicaciones. Lectura para authenticated; SIN politicas de escritura: la mantiene el disparador process_post_hashtags (SECURITY DEFINER), y la autorizacion real es la de posts.';

COMMENT ON TABLE public.post_hashtags IS
  'Asociacion publicacion-etiqueta. Lectura para authenticated; SIN politicas de escritura. Antes cualquier cuenta podia colgar una etiqueta de la publicacion de otra persona, porque la politica de insercion no comprobaba el autor.';

-- ============================================================================
-- VERIFICACIÓN MANUAL
-- ============================================================================
--
-- 1. Solo quedan las dos políticas de lectura:
--
--      SELECT tablename, policyname, cmd, roles
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename IN ('hashtags', 'post_hashtags')
--      ORDER BY tablename, policyname;
--
--    Esperado: `hashtags_select` y `post_hashtags_select`, ambas SELECT y
--    ambas para `{authenticated}`. Ninguna otra.
--
-- 2. Las etiquetas siguen apareciendo al publicar, que es lo que hay que
--    comprobar de verdad. Con una sesión normal:
--
--      INSERT INTO public.posts (user_id, content)
--      VALUES (auth.uid(), 'probando #migracion');
--
--      SELECT h.tag, h.post_count
--      FROM public.hashtags h
--      JOIN public.post_hashtags ph ON ph.hashtag_id = h.id
--      WHERE h.tag = 'migracion';
--
--    Esperado: una fila. Si no aparece, el disparador dejó de pasar por encima
--    de RLS y esta migración habría que revertirla.
--
-- 3. Y la escritura directa ya no se puede. Con una sesión normal:
--
--      INSERT INTO public.hashtags (tag, post_count) VALUES ('inventada', 9999);
--
--    Esperado: error de política.
-- ============================================================================
