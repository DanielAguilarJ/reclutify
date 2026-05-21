import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getMyProfile } from '@/app/actions/profile';
import MessagesClient from '@/components/messages/MessagesClient';
import AppNavbar from '@/components/ui/AppNavbar';

export const metadata: Metadata = {
  title: 'Mensajes — Reclutify',
  description: 'Mensajes directos en Reclutify.',
  openGraph: {
    title: 'Mensajes | Reclutify',
    description: 'Envía y recibe mensajes directos con tus conexiones en Reclutify.',
    url: '/messages',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Mensajes | Reclutify' },
  robots: { index: false, follow: true },
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/messages');
  }

  const profile = await getMyProfile();
  const navUser = profile ? {
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={navUser} activeRoute="/messages" />
      <MessagesClient userId={user.id} />
    </div>
  );
}
