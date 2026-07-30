// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  PUBLIC_JOB_COLUMNS,
  toPublicJobListing,
  toPublicJobListings,
  toPublicJobTopics,
} from '@/lib/jobs/public-projection';

/**
 * Pruebas de la proyección pública de vacantes.
 *
 * Lo que fijan: la rúbrica de los criterios de evaluación (`weight`, `poor`,
 * `acceptable`, `excellent`) NO puede salir por una lectura pública. Es el
 * material con el que la IA califica al candidato, y `roles.topics` lo guarda en
 * la misma columna que las etiquetas que el portal sí muestra.
 *
 * La comprobación es sobre el JSON serializado y no solo sobre las claves de
 * primer nivel: lo que importa es lo que cruza la red, y un campo anidado nuevo
 * en la rúbrica no debe poder colarse por debajo de una aserción demasiado
 * específica.
 */

/** Fila cruda como la entrega PostgREST: la rúbrica viene dentro de `topics`. */
const rawRow = {
  id: 'role-1',
  org_id: 'org-1',
  title: 'Backend Engineer',
  description: 'Construir servicios.',
  location: 'CDMX',
  salary: '60k',
  job_type: 'remote',
  published_at: '2026-01-01T00:00:00.000Z',
  topics: [
    {
      id: 'topic-1',
      label: 'Diseño de sistemas',
      score: 8,
      rubric: {
        excellent: 'Explica trade-offs y cuellos de botella.',
        acceptable: 'Describe una arquitectura razonable.',
        poor: 'No distingue capas.',
        weight: 9,
      },
    },
    {
      id: 'topic-2',
      label: 'SQL',
      rubric: {
        excellent: 'Optimiza con índices y planes.',
        acceptable: 'Escribe joins correctos.',
        poor: 'Confunde WHERE con HAVING.',
        weight: 6,
      },
    },
  ],
  organizations: { name: 'Acme', slug: 'acme', logo_url: null },
};

/** Rastros de la rúbrica que no deben aparecer en una respuesta pública. */
const RUBRIC_MARKERS = ['rubric', 'weight', 'excellent', 'acceptable', 'poor', 'score'];

function expectSinRubrica(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const marker of RUBRIC_MARKERS) {
    expect(serialized).not.toContain(marker);
  }
}

describe('PUBLIC_JOB_COLUMNS', () => {
  it('pide solo las columnas que el portal pinta', () => {
    expect(PUBLIC_JOB_COLUMNS).toBe(
      'id, org_id, title, description, location, salary, job_type, topics, published_at, organizations(name, slug, logo_url)'
    );
  });

  it('no expone columnas internas del puesto', () => {
    // `public_token` abre la entrevista pública y `is_published` /
    // `interview_duration` / `interview_mode` son configuración interna: ninguna
    // se pinta en el portal.
    for (const column of [
      'public_token',
      'is_published',
      'interview_duration',
      'interview_mode',
      'search_vector',
    ]) {
      expect(PUBLIC_JOB_COLUMNS).not.toContain(column);
    }
  });
});

describe('toPublicJobTopics', () => {
  it('reduce cada criterio a su etiqueta y descarta la rúbrica', () => {
    const topics = toPublicJobTopics(rawRow.topics);

    expect(topics).toEqual([
      { id: 'topic-1', label: 'Diseño de sistemas' },
      { id: 'topic-2', label: 'SQL' },
    ]);
    expectSinRubrica(topics);
  });

  it('descarta campos futuros de la rúbrica en lugar de arrastrarlos', () => {
    // La rúbrica la genera un modelo y puede ganar campos. La proyección arma un
    // objeto nuevo, así que lo añadido queda fuera sin tocar nada aquí.
    const topics = toPublicJobTopics([
      {
        id: 'topic-1',
        label: 'Comunicación',
        rubric: { excellent: 'a', acceptable: 'b', poor: 'c', weight: 5 },
        followUpQuestions: ['¿Cómo resolviste un conflicto?'],
        idealAnswer: 'Respuesta modelo del evaluador.',
      },
    ]);

    expect(topics).toEqual([{ id: 'topic-1', label: 'Comunicación' }]);
    expect(JSON.stringify(topics)).not.toContain('idealAnswer');
    expect(JSON.stringify(topics)).not.toContain('followUpQuestions');
  });

  it('acepta las filas heredadas que guardaban los criterios como cadenas', () => {
    expect(toPublicJobTopics(['Liderazgo', 'Python'])).toEqual([
      { id: 'Liderazgo', label: 'Liderazgo' },
      { id: 'Python', label: 'Python' },
    ]);
  });

  it('devuelve null cuando la columna no es un array', () => {
    expect(toPublicJobTopics(null)).toBeNull();
    expect(toPublicJobTopics(undefined)).toBeNull();
    expect(toPublicJobTopics('Liderazgo')).toBeNull();
  });

  it('descarta el criterio malformado sin perder los demás', () => {
    const topics = toPublicJobTopics([
      { id: 'ok', label: 'Kubernetes' },
      { id: 'sin-etiqueta' },
      42,
      null,
      { id: 7, label: 'Etiqueta con id numérico' },
    ]);

    expect(topics).toEqual([
      { id: 'ok', label: 'Kubernetes' },
      // Un `id` que no es cadena cae a la etiqueta: el criterio se sigue viendo.
      { id: 'Etiqueta con id numérico', label: 'Etiqueta con id numérico' },
    ]);
  });
});

describe('toPublicJobListing', () => {
  it('devuelve la vacante sin rúbrica y con la empresa embebida', () => {
    const listing = toPublicJobListing(rawRow);

    expect(listing).toEqual({
      id: 'role-1',
      org_id: 'org-1',
      title: 'Backend Engineer',
      description: 'Construir servicios.',
      location: 'CDMX',
      salary: '60k',
      job_type: 'remote',
      topics: [
        { id: 'topic-1', label: 'Diseño de sistemas' },
        { id: 'topic-2', label: 'SQL' },
      ],
      published_at: '2026-01-01T00:00:00.000Z',
      organizations: { name: 'Acme', slug: 'acme', logo_url: null },
    });
    expectSinRubrica(listing);
  });

  it('no arrastra columnas que no estén en la proyección', () => {
    // Si alguien amplía el `select`, la fila extra no llega al cliente por
    // accidente: la proyección enumera lo que devuelve.
    const listing = toPublicJobListing({
      ...rawRow,
      public_token: 'token-de-entrevista-publica',
      is_published: true,
      interview_duration: 30,
      interview_mode: 'internal',
    });

    expect(listing).not.toBeNull();
    const serialized = JSON.stringify(listing);
    expect(serialized).not.toContain('token-de-entrevista-publica');
    expect(serialized).not.toContain('interview_duration');
    expect(serialized).not.toContain('interview_mode');
    expect(serialized).not.toContain('is_published');
  });

  it('tolera columnas vacías sin hacer desaparecer la vacante', () => {
    const listing = toPublicJobListing({
      id: 'role-2',
      org_id: 'org-1',
      title: 'Sin detalles',
      description: null,
      location: null,
      salary: null,
      job_type: null,
      topics: null,
      published_at: null,
      organizations: null,
    });

    expect(listing).toEqual({
      id: 'role-2',
      org_id: 'org-1',
      title: 'Sin detalles',
      description: '',
      location: null,
      salary: null,
      job_type: null,
      topics: null,
      published_at: '',
      organizations: null,
    });
  });

  it('normaliza la empresa cuando PostgREST la entrega como array', () => {
    const listing = toPublicJobListing({
      ...rawRow,
      organizations: [{ name: 'Acme', slug: 'acme', logo_url: 'https://cdn.test/a.png' }],
    });

    expect(listing?.organizations).toEqual({
      name: 'Acme',
      slug: 'acme',
      logo_url: 'https://cdn.test/a.png',
    });
  });

  it('descarta la fila sin lo mínimo para ser una vacante del portal', () => {
    expect(toPublicJobListing({ ...rawRow, id: undefined })).toBeNull();
    expect(toPublicJobListing({ ...rawRow, org_id: null })).toBeNull();
    expect(toPublicJobListing({ ...rawRow, title: 42 })).toBeNull();
    expect(toPublicJobListing(null)).toBeNull();
  });
});

describe('toPublicJobListings', () => {
  it('proyecta el listado completo sin rúbricas', () => {
    const listings = toPublicJobListings([rawRow, { ...rawRow, id: 'role-3' }]);

    expect(listings).toHaveLength(2);
    expect(listings.map((job) => job.id)).toEqual(['role-1', 'role-3']);
    expectSinRubrica(listings);
  });

  it('devuelve un listado vacío si la consulta no trajo filas', () => {
    expect(toPublicJobListings(null)).toEqual([]);
    expect(toPublicJobListings([])).toEqual([]);
  });
});
