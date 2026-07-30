import { z } from 'zod';

/**
 * Proyección compartida de las lecturas PÚBLICAS de vacantes.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * `roles.topics` (JSONB) no guarda solo los criterios de evaluación del puesto:
 * guarda su RÚBRICA. Cada criterio lleva un `weight` y los descriptores `poor` /
 * `acceptable` / `excellent`, que son literalmente el material con el que la IA
 * califica al candidato durante la entrevista (`/api/chat`, `/api/evaluate`).
 *
 * Las tres lecturas públicas del portal —`GET /api/jobs/search`,
 * `getPublishedJobs()` y `getJobById()`— pedían `topics` en el `select` y
 * devolvían la columna tal cual. Es decir, la rúbrica completa viajaba en la
 * respuesta JSON del buscador y en el HTML de `/career-fair/[roleId]`, sin
 * sesión de por medio: cualquiera podía leer con qué se le va a evaluar antes de
 * entrar a la entrevista.
 *
 * La interfaz del portal NO usa la rúbrica. Solo pinta la ETIQUETA de cada
 * criterio, en la sección "Temas de Evaluación" de
 * `src/app/career-fair/[roleId]/JobDetailPage.tsx` y de
 * `src/components/jobs/JobDetailModal.tsx` (ambos hacen
 * `typeof topic === 'string' ? topic : topic.label`). `JobCard` no toca
 * `topics`. Por eso aquí cada criterio se reduce a `{ id, label }`.
 *
 * La reducción se hace en el servidor y no en el `select` porque PostgREST
 * proyecta COLUMNAS, no campos dentro de un JSONB: no hay forma de pedirle
 * "topics sin rubric". El servidor es el único sitio donde se puede recortar
 * antes de que la fila cruce a la red, así que la proyección vive aquí, una sola
 * vez, y no repetida en cada llamada.
 *
 * LO QUE ESTE MÓDULO NO CUBRE, A PROPÓSITO
 * ----------------------------------------
 * La entrevista SÍ necesita la rúbrica completa para evaluar. `/api/interview/ticket`
 * (vía `src/lib/interview-tickets/service.ts`) y `/api/public-interview` leen
 * `topics` sin reducir, corren con `service_role` y exigen una credencial —el
 * token del ticket o el `public_token` del puesto—. No usan esta proyección y no
 * deben usarla. Lo mismo vale para el panel autenticado, que necesita la rúbrica
 * para editarla.
 */

/** Criterio de evaluación tal como lo ve el portal público: sin rúbrica. */
export interface PublicJobTopic {
  id: string;
  label: string;
}

/** Datos de la empresa que el portal público muestra junto a la vacante. */
export interface PublicJobOrganization {
  name: string;
  slug: string;
  logo_url: string | null;
}

/**
 * Vacante tal como sale de una lectura pública.
 *
 * Es el contrato de la respuesta de `/api/jobs/search` y de los server actions
 * del portal. Todo lo que no esté aquí no sale: ni `public_token`, ni
 * `is_published`, ni `interview_duration`, ni la rúbrica de los criterios.
 */
export interface PublicJobListing {
  id: string;
  org_id: string;
  title: string;
  description: string;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  topics: PublicJobTopic[] | null;
  published_at: string;
  organizations: PublicJobOrganization | null;
}

/**
 * Columnas que pide toda lectura pública de `roles`.
 *
 * Escrita como constante para que la proyección sea evidente en revisión:
 * `public_token`, `is_published`, `interview_duration` e `interview_mode` no
 * aparecen. `topics` sí aparece —es la única forma de leer las etiquetas— pero
 * la columna cruda NO se devuelve nunca: pasa siempre por
 * `toPublicJobListing()`, que se queda con `{ id, label }` de cada criterio.
 */
export const PUBLIC_JOB_COLUMNS =
  'id, org_id, title, description, location, salary, job_type, topics, published_at, organizations(name, slug, logo_url)';

/**
 * Criterio de evaluación en su forma almacenada.
 *
 * Solo se exige `label`, que es lo único que el portal muestra. El `id` se acepta
 * como venga y se cae a la etiqueta si no es una cadena: es un detalle de clave
 * de React, y perder el criterio entero por un `id` numérico heredado sería
 * cambiar una fuga de datos por un hueco en la interfaz.
 *
 * La primera rama cubre las filas heredadas que guardaban `topics` como array de
 * cadenas — el mismo caso que `JobDetailPage` y `JobDetailModal` siguen
 * tratando con `typeof topic === 'string'`.
 */
const publicJobTopicSchema = z.union([
  z.string().transform((label): PublicJobTopic => ({ id: label, label })),
  z
    .looseObject({ id: z.unknown(), label: z.string() })
    .transform(
      ({ id, label }): PublicJobTopic => ({
        id: typeof id === 'string' ? id : label,
        label,
      })
    ),
]);

/** Empresa embebida en la fila de `roles`. */
const publicJobOrganizationSchema = z
  .looseObject({
    name: z.string(),
    slug: z.string(),
    logo_url: z.string().nullable().catch(null),
  })
  .transform(
    ({ name, slug, logo_url }): PublicJobOrganization => ({ name, slug, logo_url })
  );

/**
 * Fila de `roles` tal como la entrega PostgREST con `PUBLIC_JOB_COLUMNS`.
 *
 * `id`, `org_id` y `title` se exigen: sin ellos la tarjeta no se puede pintar ni
 * se puede postular nadie, así que la fila se descarta. El resto lleva
 * `.catch(null)` para que una columna vacía o con un tipo inesperado degrade ese
 * campo y no haga desaparecer la vacante del portal.
 */
const publicJobRowSchema = z.looseObject({
  id: z.string(),
  org_id: z.string(),
  title: z.string(),
  description: z.string().nullable().catch(null),
  location: z.string().nullable().catch(null),
  salary: z.string().nullable().catch(null),
  job_type: z.string().nullable().catch(null),
  topics: z.unknown(),
  published_at: z.string().nullable().catch(null),
  organizations: z.unknown(),
});

/**
 * Reduce `roles.topics` a las etiquetas de los criterios.
 *
 * Devuelve `null` cuando la columna no es un array (nulo o corrupto), que es lo
 * que el portal ya interpretaba como "esta vacante no publica temas". Los
 * criterios malformados se descartan uno a uno en lugar de invalidar la vacante
 * entera.
 *
 * Todo lo que no sea `id` ni `label` —`rubric`, `weight`, `score` y cualquier
 * campo que la generación de rúbricas añada en el futuro— se queda fuera por
 * construcción: el `transform` del esquema arma un objeto nuevo en lugar de
 * borrar claves del original.
 */
export function toPublicJobTopics(raw: unknown): PublicJobTopic[] | null {
  if (!Array.isArray(raw)) return null;

  return raw.flatMap((entry) => {
    const parsed = publicJobTopicSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Normaliza el embed de la empresa, que PostgREST puede dar como objeto o como array. */
function toPublicJobOrganization(raw: unknown): PublicJobOrganization | null {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const parsed = publicJobOrganizationSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Convierte una fila cruda de `roles` en la vacante pública.
 *
 * Devuelve `null` si la fila no trae lo mínimo para ser una vacante del portal.
 */
export function toPublicJobListing(raw: unknown): PublicJobListing | null {
  const row = publicJobRowSchema.safeParse(raw);
  if (!row.success) return null;

  return {
    id: row.data.id,
    org_id: row.data.org_id,
    title: row.data.title,
    description: row.data.description ?? '',
    location: row.data.location,
    salary: row.data.salary,
    job_type: row.data.job_type,
    topics: toPublicJobTopics(row.data.topics),
    published_at: row.data.published_at ?? '',
    organizations: toPublicJobOrganization(row.data.organizations),
  };
}

/** Aplica `toPublicJobListing` a un listado, descartando las filas inservibles. */
export function toPublicJobListings(raw: unknown): PublicJobListing[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((row) => {
    const listing = toPublicJobListing(row);
    return listing ? [listing] : [];
  });
}
