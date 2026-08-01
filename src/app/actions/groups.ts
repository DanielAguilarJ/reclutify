'use server';
import { createClient } from '@/utils/supabase/server';

export async function createGroup(data: { name: string; description?: string; privacy?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const { data: group, error } = await supabase.from('groups').insert({
    name: data.name, slug, description: data.description || '', creator_id: user.id, privacy: data.privacy || 'public'
  }).select().single();
  if (error) return { success: false, error: error.message };
  // Add creator as admin
  await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'admin' });
  return { success: true, group };
}

export async function getGroups(filter?: 'my' | 'discover') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (filter === 'my' && user) {
    const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    if (!memberships || memberships.length === 0) return { groups: [] };
    const ids = memberships.map((m) => m.group_id);
    const { data } = await supabase.from('groups').select('*').in('id', ids).order('created_at', { ascending: false });
    return { groups: data || [] };
  }
  const { data } = await supabase.from('groups').select('*').eq('privacy', 'public').order('members_count', { ascending: false }).limit(20);
  return { groups: data || [] };
}

export async function getGroupBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('groups').select('*').eq('slug', slug).single();
  return data;
}

/**
 * Une al usuario autenticado a un grupo.
 *
 * QUÉ ESTABA MAL
 * --------------
 * Insertaba la fila sin mirar la privacidad del grupo. Y la política RLS de
 * `group_members` es `gm_insert ... WITH CHECK (user_id = auth.uid())`
 * (`20260515_groups.sql`): comprueba que te unes A TI MISMO, no que el grupo
 * ADMITA a cualquiera. Es decir, la base tampoco lo impedía.
 *
 * El resultado es que cualquier usuario autenticado podía unirse a un grupo
 * PRIVADO con solo su identificador y, una vez dentro, leer sus publicaciones: la
 * política `gp_select` concede lectura a los miembros del grupo.
 *
 * Los grupos privados se leen con `groups_select`, que ya limita la visibilidad a
 * los públicos y a los que el usuario integra, así que un grupo privado ajeno
 * devuelve `null` aquí y la unión se rechaza.
 */
export async function joinGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { data: group } = await supabase
    .from('groups')
    .select('id, privacy')
    .eq('id', groupId)
    .maybeSingle();

  // Mismo mensaje para «no existe» y «es privado»: distinguirlos permitiría
  // enumerar los grupos privados de la plataforma.
  if (!group) return { success: false, error: 'Grupo no encontrado' };

  if (group.privacy !== 'public') {
    return { success: false, error: 'Este grupo requiere invitación' };
  }

  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: user.id });
  return { success: !error, error: error?.message };
}

export async function leaveGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
  return { success: true };
}

export async function getGroupPosts(groupId: string) {
  const supabase = await createClient();
  // La visibilidad la impone `gp_select`: publicaciones de grupos públicos o de
  // los grupos que el usuario integra. Se deja que RLS decida en lugar de
  // duplicar la regla aquí, porque para LECTURA la política sí cubre el caso.
  const { data } = await supabase.from('group_posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(50);
  return { posts: data || [] };
}

/** Tope de longitud de una publicación, igual que el `CHECK` de la tabla. */
const MAX_GROUP_POST_LENGTH = 3000;

/**
 * Publica en un grupo.
 *
 * La membresía la exige `gp_insert` en la base
 * (`WITH CHECK (user_id = auth.uid() AND group_id IN (SELECT ...))`), así que aquí
 * se comprueba antes para poder devolver un mensaje útil en vez del error crudo de
 * PostgREST, y se acota el contenido: la versión anterior lo insertaba sin recorte,
 * así que un texto de más de 3000 caracteres moría en el `CHECK` de la tabla con un
 * error de base que el usuario veía como un fallo genérico.
 */
export async function createGroupPost(groupId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const trimmed = content.trim().slice(0, MAX_GROUP_POST_LENGTH);
  if (!trimmed) return { success: false, error: 'La publicación está vacía' };

  const { data: membership } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return { success: false, error: 'No eres miembro de este grupo' };

  const { error } = await supabase.from('group_posts').insert({ group_id: groupId, user_id: user.id, content: trimmed });
  return { success: !error, error: error?.message };
}
