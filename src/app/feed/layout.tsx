import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getMyProfile, createProfile } from '@/app/actions/profile';
import AppNavbar from '@/components/ui/AppNavbar';

export const metadata: Metadata = {
  title: 'Feed — Reclutify',
  description: 'Tu feed de contenido profesional en Reclutify.',
  openGraph: {
    title: 'Feed | Reclutify',
    description: 'Descubre contenido profesional relevante en tu feed de Reclutify.',
    url: '/feed',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Feed | Reclutify' },
  robots: { index: false, follow: true },
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

  const navUser = profile ? {
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={navUser} activeRoute="/feed" />
      {children}
    </div>
  );
}
