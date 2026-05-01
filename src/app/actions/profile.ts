'use server';

import { createClient } from '@/utils/supabase/server';
import type { Profile, ProfileUpdatePayload } from '@/types/profile';
import { revalidatePath } from 'next/cache';

// ─── Validation helpers ───

function sanitizeText(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

function generateUsername(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${base}-${suffix}`;
}

// ─── Public: Get profile by username ───

export async function getProfileByUsername(
  username: string
): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !data) return null;

  return data as unknown as Profile;
}

// ─── Public: Get profile by user_id ───

export async function getProfileByUserId(
  userId: string
): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return data as unknown as Profile;
}

// ─── Public: Get current user's profile ───

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return getProfileByUserId(user.id);
}

// ─── Authenticated: Create profile ───

export async function createProfile(payload: {
  full_name: string;
  headline?: string;
  user_type?: 'candidate' | 'recruiter';
}): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  // Check if profile already exists
  const existing = await getProfileByUserId(user.id);
  if (existing) return { success: false, error: 'Profile already exists' };

  const fullName = sanitizeText(payload.full_name, 100);
  if (!fullName) return { success: false, error: 'Nombre requerido' };

  // Generate unique username
  let username = generateUsername(fullName);
  let attempts = 0;
  while (attempts < 5) {
    const { data: existingUsername } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (!existingUsername) break;
    username = generateUsername(fullName);
    attempts++;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      username,
      full_name: fullName,
      headline: payload.headline ? sanitizeText(payload.headline, 200) : null,
      user_type: payload.user_type || 'candidate',
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/profile/${username}`);
  return { success: true, profile: data as unknown as Profile };
}

// ─── Authenticated: Update profile ───

export async function updateProfile(
  payload: ProfileUpdatePayload
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  // Build sanitized update object
  const updates: Record<string, unknown> = {};

  if (payload.full_name !== undefined) {
    const name = sanitizeText(payload.full_name, 100);
    if (!name) return { success: false, error: 'Nombre no puede estar vacío' };
    updates.full_name = name;
  }
  if (payload.headline !== undefined) {
    updates.headline = sanitizeText(payload.headline, 200);
  }
  if (payload.bio !== undefined) {
    updates.bio = sanitizeText(payload.bio, 2000);
  }
  if (payload.location !== undefined) {
    updates.location = sanitizeText(payload.location, 100);
  }
  if (payload.website_url !== undefined) {
    updates.website_url = payload.website_url ? sanitizeText(payload.website_url, 500) : null;
  }
  if (payload.public_email !== undefined) {
    updates.public_email = !!payload.public_email;
  }
  if (payload.is_open_to_work !== undefined) {
    updates.is_open_to_work = !!payload.is_open_to_work;
  }
  if (payload.skills !== undefined) {
    updates.skills = payload.skills.slice(0, 50).map(s => sanitizeText(s, 50));
  }
  if (payload.experience !== undefined) {
    updates.experience = payload.experience.slice(0, 20);
  }
  if (payload.education !== undefined) {
    updates.education = payload.education.slice(0, 10);
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'No hay cambios' };
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Get username for revalidation
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', user.id)
    .single();

  if (profile?.username) {
    revalidatePath(`/profile/${profile.username}`);
  }
  revalidatePath('/profile/edit');

  return { success: true };
}

// ─── Authenticated: Increment profile views ───

export async function incrementProfileViews(profileId: string): Promise<void> {
  try {
    const supabase = await createClient();
    // Direct increment — no RPC needed
    const { data } = await supabase
      .from('profiles')
      .select('profile_views')
      .eq('id', profileId)
      .single();

    if (data) {
      await supabase
        .from('profiles')
        .update({ profile_views: (data.profile_views || 0) + 1 })
        .eq('id', profileId);
    }
  } catch {
    // Non-critical, silently fail
  }
}

// ─── Authenticated: Upload profile image ───

export async function uploadProfileImage(
  type: 'avatar' | 'banner',
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const file = formData.get('file') as File | null;
  if (!file) return { success: false, error: 'No file provided' };

  // Validate file
  const maxSize = type === 'avatar' ? 2 * 1024 * 1024 : 5 * 1024 * 1024; // 2MB / 5MB
  if (file.size > maxSize) {
    return { success: false, error: `Archivo muy grande (max ${type === 'avatar' ? '2' : '5'}MB)` };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'Solo se aceptan imágenes JPG, PNG o WebP' };
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const filePath = `profiles/${user.id}/${type}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-images')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    return { success: false, error: uploadError.message };
  }

  const { data: publicUrl } = supabase.storage
    .from('profile-images')
    .getPublicUrl(filePath);

  // Update profile with new URL
  const updateField = type === 'avatar' ? 'avatar_url' : 'banner_url';
  await supabase
    .from('profiles')
    .update({ [updateField]: publicUrl.publicUrl })
    .eq('user_id', user.id);

  revalidatePath('/profile/edit');
  return { success: true, url: publicUrl.publicUrl };
}

// ─── Public: Calculate AI Profile Score ───

export async function calculateProfileScore(username: string): Promise<{
  score: number;
  completeness: number;
  suggestions: string[];
  strengths: string[];
}> {
  const profile = await getProfileByUsername(username);
  if (!profile) return { score: 0, completeness: 0, suggestions: ['Perfil no encontrado'], strengths: [] };

  // Calculate completeness (deterministic, no AI needed)
  let completeness = 0;
  const suggestions: string[] = [];
  const strengths: string[] = [];

  if (profile.full_name) { completeness += 10; strengths.push('Nombre completo'); }
  if (profile.headline) { completeness += 15; strengths.push('Titular profesional'); }
  else suggestions.push('Agrega un titular profesional que resuma tu expertise');

  if (profile.bio && profile.bio.length > 50) { completeness += 15; strengths.push('Bio detallada'); }
  else suggestions.push('Escribe una bio de al menos 50 caracteres describiendo tu trayectoria');

  if (profile.avatar_url) { completeness += 10; strengths.push('Foto de perfil'); }
  else suggestions.push('Sube una foto profesional para generar confianza');

  if (profile.location) { completeness += 5; strengths.push('Ubicación'); }
  else suggestions.push('Agrega tu ubicación para aparecer en búsquedas locales');

  if (profile.skills.length >= 5) { completeness += 15; strengths.push(`${profile.skills.length} habilidades`); }
  else suggestions.push(`Agrega al menos 5 habilidades (tienes ${profile.skills.length})`);

  if (profile.experience.length >= 1) { completeness += 20; strengths.push(`${profile.experience.length} experiencias laborales`); }
  else suggestions.push('Agrega al menos una experiencia laboral');

  if (profile.education.length >= 1) { completeness += 10; strengths.push('Educación registrada'); }
  else suggestions.push('Agrega tu formación académica');

  // Score = completeness weighted by quality signals
  const score = Math.min(100, completeness);

  return { score, completeness, suggestions, strengths };
}
