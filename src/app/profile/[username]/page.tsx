import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProfileByUsername, calculateProfileScore } from '@/app/actions/profile';
import { createClient } from '@/utils/supabase/server';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileAbout } from '@/components/profile/ProfileAbout';
import { ProfileExperienceSection } from '@/components/profile/ProfileExperience';
import { ProfileEducationSection } from '@/components/profile/ProfileEducation';
import { ProfileScoreCard } from '@/components/profile/ProfileScoreCard';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

// ─── SEO Metadata ───

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    return { title: 'Perfil no encontrado — Reclutify' };
  }

  const title = `${profile.full_name}${profile.headline ? ` — ${profile.headline}` : ''} | Reclutify`;
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : `Perfil profesional de ${profile.full_name} en Reclutify`;

  return {
    title,
    description,
    openGraph: {
      title: profile.full_name,
      description,
      type: 'profile',
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : [],
      siteName: 'Reclutify',
    },
    twitter: {
      card: 'summary',
      title: profile.full_name,
      description,
    },
  };
}

// ─── Page ───

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    notFound();
  }

  // Check if this is the user's own profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isOwn = user?.id === profile.user_id;

  // Calculate AI Profile Score
  const score = await calculateProfileScore(username);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="text-xl font-bold bg-gradient-to-r from-blue-50 to-purple-50 bg-clip-text text-transparent">
            Reclutify
          </a>
          <nav className="flex items-center gap-4">
            <a href="/career-fair" className="text-sm text-neutral-50 hover:text-neutral-80 transition-colors">
              Vacantes
            </a>
            {user ? (
              <a href="/profile/edit" className="text-sm text-neutral-50 hover:text-neutral-80 transition-colors">
                Mi perfil
              </a>
            ) : (
              <a href="/login" className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-white hover:bg-blue-40 transition-colors">
                Iniciar sesión
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Profile content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-10 overflow-hidden">
          <ProfileHeader profile={profile} isOwn={isOwn} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            <ProfileAbout profile={profile} />
            <ProfileExperienceSection experience={profile.experience} />
            <ProfileEducationSection education={profile.education} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AI Score — only show to profile owner */}
            {isOwn && <ProfileScoreCard score={score} />}

            {/* Profile stats */}
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-10">
              <h3 className="text-sm font-semibold text-neutral-40 uppercase tracking-wide mb-3">
                Estadísticas
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-50">Vistas de perfil</span>
                  <span className="text-sm font-bold text-neutral-80">{profile.profile_views}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-50">Conexiones</span>
                  <span className="text-sm font-bold text-neutral-80">{profile.connections_count}</span>
                </div>
              </div>
            </section>

            {/* Skills quick view (sidebar) */}
            {profile.skills.length > 0 && (
              <section className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-10">
                <h3 className="text-sm font-semibold text-neutral-40 uppercase tracking-wide mb-3">
                  Top habilidades
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.slice(0, 8).map((skill, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-10 text-purple-60"
                    >
                      {skill}
                    </span>
                  ))}
                  {profile.skills.length > 8 && (
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-10 text-neutral-40">
                      +{profile.skills.length - 8} más
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
