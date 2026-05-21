import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProfileByUsername, calculateProfileScore, incrementProfileViews, getUserRecentPosts, getMyProfile } from '@/app/actions/profile';
import { getConnectionStatus } from '@/app/actions/connections';
import { createClient } from '@/utils/supabase/server';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileAbout } from '@/components/profile/ProfileAbout';
import { ProfileExperienceSection } from '@/components/profile/ProfileExperience';
import { ProfileEducationSection } from '@/components/profile/ProfileEducation';
import { ProfileScoreCard } from '@/components/profile/ProfileScoreCard';
import ProfileCVExport from '@/components/profile/ProfileCVExport';
import AppNavbar from '@/components/ui/AppNavbar';

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

  // Increment profile views if not own profile
  if (!isOwn) {
    await incrementProfileViews(profile.id);
  }

  // Get connection status between current user and this profile
  let connectionStatus: 'none' | 'pending' | 'accepted' = 'none';
  if (user && !isOwn) {
    const connResult = await getConnectionStatus(profile.user_id);
    if (connResult.status === 'accepted' || connResult.status === 'pending') {
      connectionStatus = connResult.status;
    }
  }

  // Calculate AI Profile Score
  const score = await calculateProfileScore(username);

  // Get recent posts for activity section
  const recentPosts = await getUserRecentPosts(profile.user_id);

  // Get nav user for AppNavbar
  let navUser = null;
  if (user) {
    const myProfile = isOwn ? profile : await getMyProfile();
    if (myProfile) {
      navUser = {
        username: myProfile.username,
        full_name: myProfile.full_name,
        avatar_url: myProfile.avatar_url,
      };
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={navUser} activeRoute={isOwn ? '/profile' : undefined} />

      {/* Profile content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <ProfileHeader profile={profile} isOwn={isOwn} connectionStatus={connectionStatus} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            <ProfileAbout profile={profile} />
            <ProfileExperienceSection experience={profile.experience} />
            <ProfileEducationSection education={profile.education} />

            {/* Certifications */}
            {profile.certifications?.length > 0 && (
              <section className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">
                  Certificaciones
                </h3>
                <div className="space-y-4">
                  {profile.certifications.map((cert) => (
                    <div key={cert.id} className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
                        <span className="text-primary text-lg font-bold">🏆</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground text-sm">{cert.name}</h4>
                        <p className="text-xs text-muted">{cert.issuer}</p>
                        {cert.issue_date && (
                          <p className="text-xs text-muted/70 mt-0.5">{cert.issue_date}</p>
                        )}
                        {cert.credential_url && (
                          <a href={cert.credential_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:text-primary-hover mt-1 inline-block">
                            Ver credencial →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Languages */}
            {profile.languages?.length > 0 && (
              <section className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">
                  Idiomas
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {profile.languages.map((lang) => (
                    <div key={lang.id} className="flex items-center justify-between p-3 rounded-xl bg-surface">
                      <span className="text-sm font-medium text-foreground">{lang.language}</span>
                      <span className="text-xs text-muted capitalize">{lang.proficiency}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Activity section — recent posts */}
            {recentPosts.length > 0 && (
              <section className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">
                  Actividad reciente
                </h3>
                <div className="space-y-4">
                  {recentPosts.map((post) => (
                    <article key={post.id} className="border-b border-border last:border-0 pb-4 last:pb-0">
                      <p className="text-sm text-foreground/80 line-clamp-3">{post.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                        <span>{post.likes_count} likes</span>
                        <span>{post.comments_count} comentarios</span>
                        <time dateTime={post.created_at}>
                          {new Date(post.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </time>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* CV Download */}
            {(isOwn || connectionStatus === 'accepted') && (
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <ProfileCVExport profile={profile} />
              </div>
            )}

            {/* AI Score — only show to profile owner */}
            {isOwn && <ProfileScoreCard score={score} />}

            {/* Profile stats */}
            <section className="bg-card rounded-2xl p-6 shadow-sm border border-border">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
                Estadísticas
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Vistas de perfil</span>
                  <span className="text-sm font-bold text-foreground">{profile.profile_views}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Conexiones</span>
                  <span className="text-sm font-bold text-foreground">{profile.connections_count}</span>
                </div>
              </div>
            </section>

            {/* Skills quick view (sidebar) */}
            {profile.skills.length > 0 && (
              <section className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
                  Top habilidades
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.slice(0, 8).map((skill, i) => (
                    <span
                      key={`${skill}-${i}`}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary-light text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                  {profile.skills.length > 8 && (
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-muted">
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
