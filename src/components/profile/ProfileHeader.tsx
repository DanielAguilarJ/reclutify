import type { Profile } from '@/types/profile';

interface OpenToWorkBadgeProps {
  size?: 'sm' | 'md' | 'lg';
}

export function OpenToWorkBadge({ size = 'md' }: OpenToWorkBadgeProps) {
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-3 py-1',
    lg: 'text-sm px-4 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold
        bg-green-60/20 text-green-60 border border-green-60/30
        ${sizeClasses[size]}`}
    >
      <span className="w-2 h-2 rounded-full bg-green-60 animate-pulse" />
      Open to work
    </span>
  );
}

interface ProfileHeaderProps {
  profile: Profile;
  isOwn?: boolean;
}

export function ProfileHeader({ profile, isOwn = false }: ProfileHeaderProps) {
  return (
    <div className="relative">
      {/* Banner */}
      <div className="h-48 md:h-64 w-full rounded-t-2xl overflow-hidden bg-gradient-to-r from-blue-60 via-purple-60 to-cyan-50">
        {profile.banner_url && (
          <img
            src={profile.banner_url}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Avatar + Info */}
      <div className="px-6 md:px-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-16 sm:-mt-20">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl overflow-hidden bg-neutral-20">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                  {profile.full_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {profile.is_open_to_work && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                <OpenToWorkBadge size="sm" />
              </div>
            )}
          </div>

          {/* Name + headline */}
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-90 truncate">
              {profile.full_name}
            </h1>
            {profile.headline && (
              <p className="text-lg text-neutral-50 mt-1 line-clamp-2">
                {profile.headline}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-neutral-40">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profile.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {profile.connections_count} conexiones
              </span>
              {profile.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-50 hover:text-blue-40 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Website
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            {isOwn ? (
              <a
                href="/profile/edit"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold
                  bg-neutral-80 text-white hover:bg-neutral-70
                  transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Editar perfil
              </a>
            ) : (
              <>
                <button
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold
                    bg-blue-50 text-white hover:bg-blue-40
                    transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  Conectar
                </button>
                <button
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold
                    bg-white text-neutral-70 border border-neutral-20
                    hover:bg-neutral-10 transition-all duration-200"
                >
                  Mensaje
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
