import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getPendingRequests, getMyConnections } from '@/app/actions/connections';
import { ConnectionButton } from '@/components/network/ConnectionButton';

export const metadata: Metadata = {
  title: 'Mi Red — Reclutify',
  description: 'Gestiona tus conexiones profesionales en Reclutify.',
};

export default async function NetworkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/network');

  const [pendingRequests, connections] = await Promise.all([
    getPendingRequests(),
    getMyConnections(),
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/feed" className="text-xl font-bold bg-gradient-to-r from-blue-50 to-purple-50 bg-clip-text text-transparent">
            Reclutify
          </a>
          <nav className="flex items-center gap-5">
            <a href="/feed" className="text-sm text-neutral-50 hover:text-blue-50 transition-colors">Feed</a>
            <a href="/network" className="text-sm font-medium text-neutral-80">Mi Red</a>
            <a href="/career-fair" className="text-sm text-neutral-50 hover:text-blue-50 transition-colors">Vacantes</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-neutral-80 mb-4">
              Solicitudes pendientes ({pendingRequests.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-20 mb-3">
                    {req.profile.avatar_url ? (
                      <img src={req.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                        {req.profile.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <a href={`/profile/${req.profile.username}`} className="font-semibold text-neutral-80 hover:text-blue-50 transition-colors">
                    {req.profile.full_name}
                  </a>
                  {req.profile.headline && (
                    <p className="text-xs text-neutral-40 mt-0.5 line-clamp-2">{req.profile.headline}</p>
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
          <h2 className="text-lg font-bold text-neutral-80 mb-4">
            Mis conexiones ({connections.length})
          </h2>
          {connections.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 shadow-sm border border-neutral-10 text-center">
              <div className="text-4xl mb-3">🤝</div>
              <h3 className="text-lg font-bold text-neutral-70 mb-1">Aún no tienes conexiones</h3>
              <p className="text-sm text-neutral-40 mb-4">
                Explora perfiles y envía solicitudes de conexión para ampliar tu red.
              </p>
              <a href="/career-fair" className="inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-white hover:bg-blue-40 transition-all">
                Explorar vacantes
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => (
                <div key={conn.id} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-10 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <a href={`/profile/${conn.profile.username}`}
                      className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-neutral-20">
                      {conn.profile.avatar_url ? (
                        <img src={conn.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                          {conn.profile.full_name.charAt(0)}
                        </div>
                      )}
                    </a>
                    <div className="flex-1 min-w-0">
                      <a href={`/profile/${conn.profile.username}`}
                        className="font-semibold text-sm text-neutral-80 hover:text-blue-50 transition-colors truncate block">
                        {conn.profile.full_name}
                      </a>
                      {conn.profile.headline && (
                        <p className="text-xs text-neutral-40 truncate">{conn.profile.headline}</p>
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
