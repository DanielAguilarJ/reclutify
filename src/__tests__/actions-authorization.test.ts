// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

// `revalidatePath` toca el caché de Next, que no existe fuera de una petición.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createQuerySpy, silenceConsole, type QuerySpy } from './helpers/query-spy';

/**
 * Pruebas de las server actions que se corrigieron por seguridad.
 *
 * QUÉ SE PRUEBA Y POR QUÉ ESTAS
 * -----------------------------
 * `src/app/actions` estaba al 2,89 % de cobertura. En lugar de subir el número cubriendo los
 * lectores triviales de `feed.ts`, se cubren las cinco actions donde se corrigió un fallo de
 * autorización o de construcción de consulta. Cada prueba fija el fallo concreto, así que una
 * regresión que lo reintroduzca rompe una prueba en vez de pasar desapercibida.
 *
 * El caso de `search` es el que justifica el espía de consultas: el ataque **no cambia el
 * resultado, cambia la consulta**. Una base en memoria que devuelve filas correctas no lo
 * detectaría; hay que leer la cadena exacta que se le pasó a `.or()`.
 */

let spy: QuerySpy;

// El cliente de servidor se resuelve en el momento de la llamada, así que el doble se
// instala una vez y se reconfigura por prueba.
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => spy.client,
}));

beforeEach(() => {
  spy = createQuerySpy();
  silenceConsole();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// search.ts — inyección de filtro PostgREST
// ══════════════════════════════════════════════════════════════════════════════

describe('searchProfiles / searchJobs: inyección de filtro PostgREST', () => {
  /** El filtro que se pasó a `.or()`, o `''`. */
  function orFilter(): string {
    const args = spy.argsOf('or');
    return typeof args?.[0] === 'string' ? args[0] : '';
  }

  it('busca con un término normal', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    await searchProfiles('Ana García');

    expect(orFilter()).toContain('full_name.ilike.%Ana García%');
  });

  it('ELIMINA la coma, que en .or() separa condiciones', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    // El ataque: `.or()` recibe la gramática de filtros de PostgREST, no un valor. Una coma
    // en el término AÑADE una condición que el llamante elige, y como `or` acepta cualquier
    // columna de la tabla, se convierte en un oráculo booleano sobre columnas que el `select`
    // no devuelve.
    await searchProfiles('x,is_open_to_work.eq.true');

    const filter = orFilter();

    expect(filter).not.toContain('is_open_to_work.eq.true');
    // El término inyectado queda reducido a palabras inertes. Nótese que el guion bajo
    // TAMBIÉN desaparece: es comodín de `LIKE` («cualquier carácter»), así que dejarlo
    // pasar convertiría el término en un patrón, no en un literal.
    expect(filter).toContain('full_name.ilike.%x is open to work eq true%');

    // La comprobación se hace sobre el TÉRMINO, no sobre el filtro completo: los nombres de
    // columna llevan guion bajo (`full_name`, `is_open_to_work`) y eso es correcto. Lo que no
    // debe llevarlo es lo que escribió el usuario, porque `_` es comodín de `LIKE`.
    const term = filter.match(/full_name\.ilike\.%(.*?)%/)?.[1] ?? '';
    expect(term).not.toContain('_');
    expect(term).not.toContain(',');
    expect(term).not.toContain('.');
  });

  it('ELIMINA los comodines de LIKE', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    // Un `%` suelto convierte la búsqueda en un recorrido completo de la tabla: una
    // denegación de servicio barata sobre la base.
    await searchProfiles('%');

    // El término queda vacío tras sanear, así que NO se aplica filtro: aplicarlo con la
    // cadena vacía equivale a `%%`, que devuelve la tabla entera.
    expect(spy.allCallsOf('or')).toHaveLength(0);
  });

  it('ELIMINA paréntesis y dos puntos', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    await searchProfiles('a(b):c');

    const filter = orFilter();
    expect(filter).not.toContain('(');
    expect(filter).not.toContain(')');
    expect(filter).not.toContain(':');
  });

  it('acota la longitud del término', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    await searchProfiles('x'.repeat(500));

    // 100 caracteres: ninguna búsqueda real es más larga, y el tope evita pasar cadenas
    // arbitrarias a la base.
    const match = orFilter().match(/full_name\.ilike\.%(x+)%/);
    expect(match?.[1]).toHaveLength(100);
  });

  it('sanea también el filtro de ubicación', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    await searchProfiles('dev', { location: 'CDMX,is_open_to_work.eq.true' });

    const ilikeArgs = spy.allCallsOf('ilike').map((call) => String(call.args[1]));
    expect(ilikeArgs.join(' ')).not.toContain('eq.true');
  });

  it('acota el número de habilidades del filtro', async () => {
    const { searchProfiles } = await import('@/app/actions/search');

    await searchProfiles('dev', { skills: Array.from({ length: 200 }, (_, i) => `skill-${i}`) });

    // `overlaps` sí parametriza el array, así que aquí solo importa que no se pase un array
    // enorme que genere una consulta desmedida.
    const overlaps = spy.argsOf('overlaps');
    expect(overlaps?.[1]).toHaveLength(50);
  });

  it('searchJobs aplica el mismo saneado y filtra por publicadas', async () => {
    const { searchJobs } = await import('@/app/actions/search');

    await searchJobs('dev,org_id.eq.otra-empresa');

    expect(orFilter()).not.toContain('org_id.eq.otra-empresa');

    // La restricción a publicadas no debe perderse al sanear.
    const eqCalls = spy.allCallsOf('eq').map((call) => `${call.args[0]}=${call.args[1]}`);
    expect(eqCalls).toContain('is_published=true');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// courses.ts — faltaba autenticación en operaciones destructivas
// ══════════════════════════════════════════════════════════════════════════════

describe('courses: autenticación y pertenencia', () => {
  /** Prepara sesión con organización y un curso de esa organización. */
  function seedOwnCourse() {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('user_profiles', { data: { org_id: 'org-1' }, error: null });
    spy.setResult('courses', { data: { id: 'curso-1', org_id: 'org-1', is_active: true }, error: null });
  }

  it('deleteCourse RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { deleteCourse } = await import('@/app/actions/courses');
    const result = await deleteCourse('curso-1');

    // Antes no llamaba a `getUser()`: cualquiera podía eliminar el curso de cualquier empresa
    // con solo su identificador, y con él en cascada sus módulos, planes e histórico.
    expect(result.success).toBe(false);
    // Y no debe llegar a tocar la tabla de cursos.
    expect(spy.tables).not.toContain('courses');
  });

  it('deleteCourse RECHAZA un curso de otra organización', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('user_profiles', { data: { org_id: 'org-1' }, error: null });
    spy.setResult('courses', { data: { id: 'curso-1', org_id: 'OTRA-ORG' }, error: null });

    const { deleteCourse } = await import('@/app/actions/courses');
    const result = await deleteCourse('curso-1');

    expect(result.success).toBe(false);
    // Mismo mensaje que «no existe»: distinguirlos permitiría enumerar los cursos de otras
    // empresas por su identificador.
    expect(result.error).toBe('Curso no encontrado');
    expect(spy.allCallsOf('delete')).toHaveLength(0);
  });

  it('deleteCourse permite el de la propia organización', async () => {
    seedOwnCourse();

    const { deleteCourse } = await import('@/app/actions/courses');
    const result = await deleteCourse('curso-1');

    expect(result.success).toBe(true);
    expect(spy.allCallsOf('delete')).toHaveLength(1);
  });

  it('toggleCourseActive RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { toggleCourseActive } = await import('@/app/actions/courses');
    const result = await toggleCourseActive('curso-1');

    // Desactivar el curso de otra empresa tumba su página pública de informes.
    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });

  it('getCourseById RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { getCourseById } = await import('@/app/actions/courses');
    const result = await getCourseById('curso-1');

    // Es la vista de edición del asesor, no el catálogo público: para eso existen
    // `getPublicCourse` y `getPublicCourses`, que filtran por `is_active`.
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// company.ts — asignación masiva
// ══════════════════════════════════════════════════════════════════════════════

describe('updateCompanyProfile: lista blanca de campos', () => {
  beforeEach(() => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('org_members', { data: { role: 'owner' }, error: null });
  });

  /** Objeto que se pasó a `.update()`. */
  function updatePayload(): Record<string, unknown> {
    return (spy.argsOf('update')?.[0] ?? {}) as Record<string, unknown>;
  }

  it('escribe los campos permitidos', async () => {
    const { updateCompanyProfile } = await import('@/app/actions/company');

    await updateCompanyProfile('org-1', { description: 'Somos una empresa', industry: 'Tech' });

    expect(updatePayload()).toEqual({ description: 'Somos una empresa', industry: 'Tech' });
  });

  it('DESCARTA plan_tier, que era una escalada de plan', async () => {
    const { updateCompanyProfile } = await import('@/app/actions/company');

    // El fallo: `.update(updates)` recibía el objeto tal cual. El TIPO de TypeScript declaraba
    // siete campos, pero un tipo no es una comprobación en tiempo de ejecución, y una server
    // action recibe su argumento serializado desde el navegador. `{ plan_tier: 'enterprise' }`
    // pasaba la comprobación de permisos —el usuario ES admin de su organización— y se
    // auto-concedía el plan más caro.
    await updateCompanyProfile('org-1', {
      description: 'ok',
      plan_tier: 'enterprise',
      subscription_status: 'active',
      stripe_customer_id: 'cus_falso',
      slug: 'slug-secuestrado',
      owner_id: 'otro-usuario',
    } as Parameters<typeof updateCompanyProfile>[1]);

    expect(updatePayload()).toEqual({ description: 'ok' });
  });

  it('RECHAZA si no es owner ni admin de la organización', async () => {
    spy.setResult('org_members', { data: null, error: null });

    const { updateCompanyProfile } = await import('@/app/actions/company');
    const result = await updateCompanyProfile('org-1', { description: 'x' });

    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });

  it('RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { updateCompanyProfile } = await import('@/app/actions/company');
    const result = await updateCompanyProfile('org-1', { description: 'x' });

    expect(result.success).toBe(false);
  });

  it('no escribe si no queda ningún campo válido', async () => {
    const { updateCompanyProfile } = await import('@/app/actions/company');

    const result = await updateCompanyProfile('org-1', {
      plan_tier: 'enterprise',
    } as Parameters<typeof updateCompanyProfile>[1]);

    // Un `update({})` en PostgREST es un error, y devolver éxito sin haber cambiado nada
    // sería mentir al llamante.
    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// groups.ts — grupos privados
// ══════════════════════════════════════════════════════════════════════════════

describe('joinGroup: privacidad del grupo', () => {
  beforeEach(() => {
    spy.setUser({ id: 'usuario-1' });
  });

  it('permite unirse a un grupo público', async () => {
    spy.setResult('groups', { data: { id: 'grupo-1', privacy: 'public' }, error: null });

    const { joinGroup } = await import('@/app/actions/groups');
    const result = await joinGroup('grupo-1');

    expect(result.success).toBe(true);
    expect(spy.allCallsOf('insert')).toHaveLength(1);
  });

  it('RECHAZA unirse a un grupo PRIVADO', async () => {
    spy.setResult('groups', { data: { id: 'grupo-1', privacy: 'private' }, error: null });

    const { joinGroup } = await import('@/app/actions/groups');
    const result = await joinGroup('grupo-1');

    // El fallo: la política RLS `gm_insert` es `WITH CHECK (user_id = auth.uid())`, que
    // comprueba que te unes A TI MISMO, no que el grupo admita a cualquiera. Así que la base
    // tampoco lo impedía, y una vez dentro `gp_select` concede lectura de las publicaciones.
    expect(result.success).toBe(false);
    expect(spy.allCallsOf('insert')).toHaveLength(0);
  });

  it('RECHAZA un grupo que no existe, con el mismo mensaje que uno privado', async () => {
    spy.setResult('groups', { data: null, error: null });

    const { joinGroup } = await import('@/app/actions/groups');
    const result = await joinGroup('grupo-inventado');

    // Mensajes distintos permitirían enumerar los grupos privados de la plataforma.
    expect(result.success).toBe(false);
    expect(result.error).toBe('Grupo no encontrado');
  });

  it('RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { joinGroup } = await import('@/app/actions/groups');

    expect((await joinGroup('grupo-1')).success).toBe(false);
    expect(spy.allCallsOf('insert')).toHaveLength(0);
  });
});

describe('createGroupPost: membresía y longitud', () => {
  beforeEach(() => {
    spy.setUser({ id: 'usuario-1' });
  });

  it('RECHAZA publicar sin ser miembro', async () => {
    spy.setResult('group_members', { data: null, error: null });

    const { createGroupPost } = await import('@/app/actions/groups');
    const result = await createGroupPost('grupo-1', 'hola');

    expect(result.success).toBe(false);
    expect(result.error).toBe('No eres miembro de este grupo');
  });

  it('acota el contenido al máximo de la tabla', async () => {
    spy.setResult('group_members', { data: { group_id: 'grupo-1' }, error: null });

    const { createGroupPost } = await import('@/app/actions/groups');
    await createGroupPost('grupo-1', 'x'.repeat(5000));

    // Antes se insertaba sin recortar, así que un texto de más de 3000 caracteres moría en el
    // `CHECK` de la tabla y el usuario veía un error genérico de base de datos.
    const payload = spy.argsOf('insert')?.[0] as { content: string };
    expect(payload.content).toHaveLength(3000);
  });

  it('RECHAZA una publicación vacía', async () => {
    spy.setResult('group_members', { data: { group_id: 'grupo-1' }, error: null });

    const { createGroupPost } = await import('@/app/actions/groups');
    const result = await createGroupPost('grupo-1', '    ');

    expect(result.success).toBe(false);
    expect(spy.allCallsOf('insert')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// jobs.ts — publicar una vacante
// ══════════════════════════════════════════════════════════════════════════════

describe('toggleRolePublished: permiso de escritura de la organización', () => {
  it('RECHAZA sin sesión', async () => {
    spy.setUser(null);

    const { toggleRolePublished } = await import('@/app/actions/jobs');
    const result = await toggleRolePublished('rol-1', true);

    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });

  it('RECHAZA una vacante que no existe, sin escribir', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('roles', { data: null, error: null });

    const { toggleRolePublished } = await import('@/app/actions/jobs');
    const result = await toggleRolePublished('rol-inventado', true);

    // Antes el `update` afectaba a cero filas y devolvía `success: true`, así que la interfaz
    // informaba de un cambio que no ocurrió.
    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });

  it('RECHAZA a un miembro sin permiso de escritura', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('roles', { data: { id: 'rol-1', org_id: 'org-1' }, error: null });
    spy.setResult('org_members', { data: null, error: null });
    spy.setResult('user_profiles', { data: { org_id: 'org-1', role: 'member' }, error: null });

    const { toggleRolePublished } = await import('@/app/actions/jobs');
    const result = await toggleRolePublished('rol-1', true);

    // La política RLS limitaba a la organización pero NO al rol, así que cualquier miembro
    // podía publicar o retirar del portal público la vacante de su empresa. Publicar es una
    // acción de cara al exterior.
    expect(result.success).toBe(false);
    expect(spy.allCallsOf('update')).toHaveLength(0);
  });

  it('permite a un owner por org_members', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('roles', { data: { id: 'rol-1', org_id: 'org-1' }, error: null });
    spy.setResult('org_members', { data: { role: 'owner' }, error: null });

    const { toggleRolePublished } = await import('@/app/actions/jobs');
    const result = await toggleRolePublished('rol-1', true);

    expect(result.success).toBe(true);

    const payload = spy.argsOf('update')?.[0] as { is_published: boolean; published_at: unknown };
    expect(payload.is_published).toBe(true);
    expect(payload.published_at).not.toBeNull();
  });

  it('permite a un owner por user_profiles, sin fila en org_members', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('roles', { data: { id: 'rol-1', org_id: 'org-1' }, error: null });
    spy.setResult('org_members', { data: null, error: null });
    spy.setResult('user_profiles', { data: { org_id: 'org-1', role: 'owner' }, error: null });

    const { toggleRolePublished } = await import('@/app/actions/jobs');

    // Dos fuentes de pertenencia a propósito: el onboarding inserta la fila de `org_members`
    // en modo «mejor esfuerzo», así que exigirla en exclusiva devolvería un rechazo al dueño
    // legítimo cuya fila nunca se creó.
    expect((await toggleRolePublished('rol-1', true)).success).toBe(true);
  });

  it('al despublicar limpia published_at', async () => {
    spy.setUser({ id: 'usuario-1' });
    spy.setResult('roles', { data: { id: 'rol-1', org_id: 'org-1' }, error: null });
    spy.setResult('org_members', { data: { role: 'admin' }, error: null });

    const { toggleRolePublished } = await import('@/app/actions/jobs');
    await toggleRolePublished('rol-1', false);

    const payload = spy.argsOf('update')?.[0] as { published_at: unknown };
    expect(payload.published_at).toBeNull();
  });
});
