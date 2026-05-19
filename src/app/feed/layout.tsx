import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getMyProfile, createProfile } from '@/app/actions/profile';
import { CandidateTopNav } from '@/components/shared/CandidateTopNav';

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
      <CandidateTopNav
        user={{ id: user.id, email: user.email || undefined }}
        profile={profile ? { username: profile.username, avatar_url: profile.avatar_url || undefined, full_name: profile.full_name } : null}
      />
      {children}
    </div>
  );
}
