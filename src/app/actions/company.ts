'use server';
import { createClient } from '@/utils/supabase/server';

export async function getCompanyBySlug(slug: string) {
  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).single();
  if (!org) return null;
  // Get published jobs count
  const { count } = await supabase.from('roles').select('*', { count: 'exact', head: true })
    .eq('org_id', org.id).eq('is_published', true);
  // Get published jobs
  const { data: jobs } = await supabase.from('roles').select('id, title, location, salary, job_type, created_at')
    .eq('org_id', org.id).eq('is_published', true).order('created_at', { ascending: false }).limit(10);
  return { ...org, jobCount: count || 0, jobs: jobs || [] };
}

/**
 * Campos de `organizations` que la ficha de empresa puede modificar.
 *
 * POR QUÉ UNA LISTA BLANCA EXPLÍCITA
 * ----------------------------------
 * La versión anterior hacía `.update(updates)` con el objeto tal como llegaba. El
 * TIPO de TypeScript declaraba siete campos, pero un tipo no es una comprobación
 * en tiempo de ejecución: una server action recibe su argumento serializado desde
 * el navegador, así que el objeto real puede traer CUALQUIER clave.
 *
 * Y `organizations` tiene columnas que no debe tocar esta pantalla:
 * `plan_tier`, `subscription_status`, `stripe_customer_id`,
 * `max_interviews_per_month`, `slug`, `owner_id`. Un `updates` con
 * `{ plan_tier: 'enterprise' }` pasaba la comprobación de permisos —el usuario ES
 * admin de su organización— y se auto-concedía el plan más caro. Escalada de
 * privilegios de facturación con una petición.
 *
 * Se filtra por lista blanca en lugar de por lista negra: una columna nueva en la
 * tabla queda fuera por defecto, en vez de dentro hasta que alguien se acuerde de
 * excluirla.
 */
const COMPANY_EDITABLE_FIELDS = [
  'description',
  'industry',
  'company_size',
  'website',
  'headquarters',
  'founded_year',
  'social_links',
] as const;

type CompanyEditableField = (typeof COMPANY_EDITABLE_FIELDS)[number];

export type CompanyProfileUpdate = Partial<{
  description: string;
  industry: string;
  company_size: string;
  website: string;
  headquarters: string;
  founded_year: number;
  social_links: Record<string, string>;
}>;

/**
 * Se queda solo con las claves permitidas del objeto recibido.
 *
 * Devuelve un objeto NUEVO en vez de borrar claves del original: así el resultado
 * no puede arrastrar propiedades heredadas del prototipo del argumento.
 */
function pickEditableCompanyFields(updates: unknown): Record<string, unknown> {
  if (!updates || typeof updates !== 'object') return {};

  const source = updates as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of COMPANY_EDITABLE_FIELDS satisfies readonly CompanyEditableField[]) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      result[field] = source[field];
    }
  }

  return result;
}

export async function updateCompanyProfile(orgId: string, updates: CompanyProfileUpdate) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  // Verify user is admin/owner of this org
  const { data: membership } = await supabase.from('org_members').select('role')
    .eq('user_id', user.id).eq('org_id', orgId).in('role', ['owner', 'admin']).maybeSingle();
  if (!membership) return { success: false, error: 'Not authorized' };

  const safeUpdates = pickEditableCompanyFields(updates);

  // Sin campos válidos no se escribe: un `update({})` en PostgREST es un error, y
  // devolver éxito sin haber cambiado nada sería mentir al llamante.
  if (Object.keys(safeUpdates).length === 0) {
    return { success: false, error: 'No editable fields provided' };
  }

  const { error } = await supabase.from('organizations').update(safeUpdates).eq('id', orgId);
  return { success: !error, error: error?.message };
}

export async function getAllCompanies() {
  const supabase = await createClient();
  const { data } = await supabase.from('organizations').select('id, name, slug, logo_url, industry, company_size, description, followers_count')
    .order('followers_count', { ascending: false }).limit(50);
  return { companies: data || [] };
}
