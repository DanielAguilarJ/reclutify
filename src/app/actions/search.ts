'use server';
import { createClient } from '@/utils/supabase/server';

/**
 * Búsqueda de personas y vacantes.
 *
 * QUÉ ESTABA MAL: INYECCIÓN DE FILTRO POSTGREST
 * ---------------------------------------------
 * Las dos búsquedas interpolaban el término del usuario directamente en un `.or()`:
 *
 *     q.or(`full_name.ilike.%${query}%,headline.ilike.%${query}%,...`)
 *
 * El argumento de `.or()` NO es un valor parametrizado: es la **gramática de
 * filtros de PostgREST**, que se envía tal cual en la cadena de consulta. La coma
 * separa condiciones y el punto separa columna, operador y valor. Así que un
 * término con una coma no busca una coma: **añade condiciones**.
 *
 * Con `query = "x,is_open_to_work.eq.true"` el filtro resultante es
 * `full_name.ilike.%x`, más una condición nueva que el llamante escribió. Y como
 * `or` acepta cualquier columna de la tabla, el término controla qué columnas se
 * consultan: es un oráculo booleano sobre columnas que la proyección del `select`
 * no devuelve, que es la forma de extraer datos que no se muestran (por ejemplo,
 * comprobar si una columna privada de un perfil concreto tiene un valor dado).
 *
 * No es SQL injection —PostgREST sigue construyendo SQL parametrizado— pero es
 * inyección en la capa de filtros, con el mismo efecto práctico: el llamante
 * decide la consulta.
 *
 * CÓMO SE CORRIGE
 * ---------------
 * `sanitizeFilterTerm` quita los metacaracteres de la gramática y de `LIKE`. No se
 * escapan para preservarlos: se ELIMINAN. Un término de búsqueda legítimo de este
 * producto —un nombre, un puesto, una tecnología— no contiene comas, paréntesis ni
 * comodines, así que quitarlos no degrada ninguna búsqueda real y no deja ningún
 * caso límite de escapado que revisar.
 */

/**
 * Deja un término apto para interpolar en un filtro `ilike` de PostgREST.
 *
 * Se eliminan:
 *
 *  - `,` `(` `)` — separan y agrupan condiciones en la gramática de `or()`.
 *  - `.` — separa columna, operador y valor.
 *  - `:` — prefijo de alias y de tipo (`col::text`).
 *  - `%` `_` — comodines de `LIKE`. Un `%` suelto en el término convierte la
 *    búsqueda en un recorrido completo de la tabla, que es una denegación de
 *    servicio barata sobre la base.
 *  - `\` `"` `'` — escapes y delimitadores.
 *
 * Se recorta a 100 caracteres: ninguna búsqueda real es más larga y el tope evita
 * pasar cadenas arbitrarias a la base.
 */
function sanitizeFilterTerm(raw: string): string {
  return raw
    .replace(/[,().:%_\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Columnas públicas de un perfil. */
const PROFILE_COLUMNS =
  'user_id, username, full_name, headline, avatar_url, location, skills, is_open_to_work, connections_count';

/** Columnas públicas de una vacante. */
const JOB_COLUMNS =
  'id, title, description, location, salary, job_type, interview_duration, created_at, org_id';

export async function searchProfiles(
  query: string,
  filters?: { location?: string; skills?: string[] },
) {
  const supabase = await createClient();
  let q = supabase.from('profiles').select(PROFILE_COLUMNS);

  const term = sanitizeFilterTerm(query ?? '');

  // Si el término se queda vacío tras sanear (por ejemplo, era solo `%`), NO se
  // aplica filtro alguno en lugar de aplicar uno con la cadena vacía, que en
  // `ilike` equivale a `%%` y devuelve la tabla entera.
  if (term) {
    q = q.or(
      `full_name.ilike.%${term}%,headline.ilike.%${term}%,username.ilike.%${term}%,bio.ilike.%${term}%`,
    );
  }

  const location = sanitizeFilterTerm(filters?.location ?? '');
  if (location) q = q.ilike('location', `%${location}%`);

  // `overlaps` sí parametriza el array, así que no necesita saneado de gramática.
  // Se acota el número de elementos para que un array enorme no genere una
  // consulta desmedida.
  if (filters?.skills && filters.skills.length > 0) {
    q = q.overlaps('skills', filters.skills.slice(0, 50));
  }

  const { data, error } = await q.limit(20);
  if (error) return { profiles: [], error: error.message };
  return { profiles: data || [] };
}

export async function searchJobs(
  query: string,
  filters?: { location?: string; jobType?: string },
) {
  const supabase = await createClient();
  let q = supabase.from('roles').select(JOB_COLUMNS).eq('is_published', true);

  const term = sanitizeFilterTerm(query ?? '');

  if (term) {
    q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,location.ilike.%${term}%`);
  }

  const location = sanitizeFilterTerm(filters?.location ?? '');
  if (location) q = q.ilike('location', `%${location}%`);

  // `eq` parametriza el valor, así que aquí basta acotar la longitud.
  const jobType = filters?.jobType?.trim().slice(0, 100);
  if (jobType) q = q.eq('job_type', jobType);

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
  if (error) return { jobs: [], error: error.message };
  return { jobs: data || [] };
}

/** Una fila de `connections` tal como la devuelve el `select` de abajo. */
interface ConnectionRow {
  requester_id: string | null;
  addressee_id: string | null;
}

export async function getPeopleSuggestions() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { suggestions: [] };

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('skills, location')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: connections } = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  // `user.id` viene del JWT validado por `getUser()`, no de la petición, así que
  // aquí la interpolación es de un valor de confianza y no de entrada de usuario.

  const connectedIds = new Set<string>([user.id]);

  // Antes: `connections?.forEach((c: any) => ...)`. Tipado explícito para que un
  // cambio en el `select` rompa la compilación en vez de propagar `undefined`.
  for (const connection of (connections ?? []) as ConnectionRow[]) {
    if (connection.requester_id) connectedIds.add(connection.requester_id);
    if (connection.addressee_id) connectedIds.add(connection.addressee_id);
  }

  let q = supabase
    .from('profiles')
    .select('user_id, username, full_name, headline, avatar_url, location, skills, is_open_to_work')
    .limit(10);

  // `not('user_id', 'in', ...)` construía la lista interpolando los
  // identificadores en una cadena. Todos son UUID que salen de la base, así que no
  // era explotable, pero se filtra por forma de UUID antes de interpolar para que
  // una fila corrupta no pueda alterar la consulta.
  const safeIds = [...connectedIds].filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  );

  if (safeIds.length > 0) {
    q = q.not('user_id', 'in', `(${safeIds.join(',')})`);
  }

  if (myProfile?.location) q = q.order('location', { ascending: true });

  const { data } = await q;
  return { suggestions: data || [] };
}
