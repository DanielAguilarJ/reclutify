import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getMyProfile, createProfile } from '@/app/actions/profile';
import { createClient } from '@/utils/supabase/server';
import ProfileEditForm from '@/components/profile/ProfileEditForm';

export const metadata: Metadata = {
  title: 'Editar Perfil — Reclutify',
  description: 'Edita tu perfil profesional en Reclutify.',
};

export default async function ProfileEditPage() {
  // Ensure user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/profile/edit');
  }

  // Try to get existing profile
  let profile = await getMyProfile();

  // Auto-create profile if it doesn't exist
  if (!profile) {
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
    const result = await createProfile({ full_name: name });
    if (result.success && result.profile) {
      profile = result.profile;
    } else {
      // Fallback: redirect to login on error
      redirect('/login');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="text-xl font-bold bg-gradient-to-r from-blue-50 to-purple-50 bg-clip-text text-transparent">
            Reclutify
          </a>
          <a
            href={`/profile/${profile.username}`}
            className="text-sm text-neutral-50 hover:text-neutral-80 transition-colors"
          >
            Ver perfil público →
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-80">Editar perfil</h1>
          <p className="text-neutral-40 mt-1">
            Tu perfil público en <span className="font-medium text-neutral-60">reclutify.com/profile/{profile.username}</span>
          </p>
        </div>

        <ProfileEditForm profile={profile} />
      </main>
    </div>
  );
}
