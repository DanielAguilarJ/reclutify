import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getMyProfile, createProfile } from '@/app/actions/profile';

export const metadata: Metadata = {
  title: 'Feed — Reclutify',
  description: 'Tu feed de contenido profesional en Reclutify.',
};

export default async function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/feed');
  }

  // Ensure social profile exists (created during onboarding)
  let profile = await getMyProfile();
  if (!profile) {
    // No social profile — user may have skipped onboarding or it failed.
    // Auto-create a minimal profile so the feed doesn't break.
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario';
    const result = await createProfile({ full_name: name });
    if (result.profile) {
      profile = result.profile;
    } else {
      redirect('/onboarding?role=candidate');
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/feed" className="text-xl font-bold bg-gradient-to-r from-blue-50 to-purple-50 bg-clip-text text-transparent">
            Reclutify
          </a>
          <nav className="flex items-center gap-5">
            <a href="/feed" className="text-sm font-medium text-neutral-80 hover:text-blue-50 transition-colors">
              Feed
            </a>
            <a href="/career-fair" className="text-sm text-neutral-50 hover:text-blue-50 transition-colors">
              Vacantes
            </a>
            {profile && (
              <a href={`/profile/${profile.username}`}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-20">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                      {profile.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </a>
            )}
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
