import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import MessagesClient from '@/components/messages/MessagesClient';

export const metadata: Metadata = {
  title: 'Mensajes — Reclutify',
  description: 'Mensajes directos en Reclutify.',
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/messages');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-10">
        <div className="max-w-full mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/feed" className="text-xl font-bold bg-gradient-to-r from-blue-50 to-purple-50 bg-clip-text text-transparent">
            Reclutify
          </a>
          <nav className="flex items-center gap-5">
            <a href="/feed" className="text-sm text-neutral-50 hover:text-blue-50 transition-colors">Feed</a>
            <a href="/network" className="text-sm text-neutral-50 hover:text-blue-50 transition-colors">Red</a>
            <a href="/messages" className="text-sm font-medium text-neutral-80">Mensajes</a>
          </nav>
        </div>
      </header>

      <MessagesClient userId={user.id} />
    </div>
  );
}
