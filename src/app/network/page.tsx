import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getPendingRequests, getMyConnections } from '@/app/actions/connections';
import { getMyProfile } from '@/app/actions/profile';
import { ConnectionButton } from '@/components/network/ConnectionButton';
import AppNavbar from '@/components/ui/AppNavbar';

export const metadata: Metadata = {
  title: 'Mi Red — Reclutify',
  description: 'Gestiona tus conexiones profesionales en Reclutify.',
  openGraph: {
    title: 'Mi Red | Reclutify',
    description: 'Gestiona y amplía tu red de conexiones profesionales en Reclutify.',
    url: '/network',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Mi Red | Reclutify' },
  robots: { index: false, follow: true },
};

export default async function NetworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/network');

  const [pendingRequests, connections, profile] = await Promise.all([
    getPendingRequests(),
    getMyConnections(),
    getMyProfile(),
  ]);

  const navUser = profile ? {
    username: profile.username,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={navUser} activeRoute="/network" />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-foreground mb-4">
              Solicitudes pendientes ({pendingRequests.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-card rounded-2xl p-5 shadow-sm border border-border flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-surface mb-3">
                    {req.profile.avatar_url ? (
                      <img src={req.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-primary">
                        {req.profile.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <a href={`/profile/${req.profile.username}`} className="font-semibold text-foreground hover:text-primary transition-colors">
                    {req.profile.full_name}
                  </a>
                  {req.profile.headline && (
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{req.profile.headline}</p>
                  )}
                  <div className="mt-3">
                    <ConnectionButton
                      targetUserId={req.profile.user_id}
                      initialStatus="pending"
                      connectionId={req.id}
                      isRequester={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Connections */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">
            Mis conexiones ({connections.length})
          </h2>
          {connections.length === 0 ? (
            <div className="bg-card rounded-2xl p-10 shadow-sm border border-border text-center">
              <div className="text-4xl mb-3">🤝</div>
              <h3 className="text-lg font-bold text-foreground mb-1">Aún no tienes conexiones</h3>
              <p className="text-sm text-muted mb-4">
                Explora perfiles y envía solicitudes de conexión para ampliar tu red.
              </p>
              <a href="/career-fair" className="inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-all">
                Explorar vacantes
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => (
                <div key={conn.id} className="bg-card rounded-2xl p-5 shadow-sm border border-border hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <a href={`/profile/${conn.profile.username}`}
                      className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface">
                      {conn.profile.avatar_url ? (
                        <img src={conn.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white bg-primary">
                          {conn.profile.full_name.charAt(0)}
                        </div>
                      )}
                    </a>
                    <div className="flex-1 min-w-0">
                      <a href={`/profile/${conn.profile.username}`}
                        className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate block">
                        {conn.profile.full_name}
                      </a>
                      {conn.profile.headline && (
                        <p className="text-xs text-muted truncate">{conn.profile.headline}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
