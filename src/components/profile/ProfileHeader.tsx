'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/types/profile';
import { useAppStore } from '@/store/appStore';
import { sendConnectionRequest } from '@/app/actions/connections';
import { useToast } from '@/components/ui/Toast';
import { MapPin, Users, Link2, UserPlus, MessageCircle, Pencil } from 'lucide-react';

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
        bg-success/20 text-success border border-success/30
        ${sizeClasses[size]}`}
    >
      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
      Open to work
    </span>
  );
}

interface ProfileHeaderProps {
  profile: Profile;
  isOwn?: boolean;
  connectionStatus?: 'none' | 'pending' | 'accepted' | null;
}

export function ProfileHeader({ profile, isOwn = false, connectionStatus = 'none' }: ProfileHeaderProps) {
  const [connecting, setConnecting] = useState(false);
  const [connStatus, setConnStatus] = useState(connectionStatus);
  const router = useRouter();
  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const handleConnect = async () => {
    if (connecting || connStatus === 'accepted' || connStatus === 'pending') return;
    setConnecting(true);
    try {
      const result = await sendConnectionRequest(profile.user_id);
      if (result.success) {
        setConnStatus('pending');
        showToast('success', t('Connection request sent!', '¡Solicitud de conexión enviada!'));
      } else {
        showToast('error', result.error || t('Could not connect', 'No se pudo conectar'));
      }
    } catch {
      showToast('error', t('Something went wrong', 'Algo salió mal'));
    }
    setConnecting(false);
  };

  const handleMessage = () => {
    router.push(`/messages?to=${profile.user_id}`);
  };

  const getConnectButtonText = () => {
    if (connStatus === 'accepted') return t('Connected', 'Conectado');
    if (connStatus === 'pending') return t('Pending', 'Pendiente');
    return t('Connect', 'Conectar');
  };

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
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-card shadow-xl overflow-hidden bg-surface">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted bg-gradient-to-br from-blue-10 to-purple-10">
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
              {profile.full_name}
            </h1>
            {profile.headline && (
              <p className="text-lg text-muted mt-1 line-clamp-2">
                {profile.headline}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {profile.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {profile.connections_count} {t('connections', 'conexiones')}
              </span>
              {profile.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:text-primary-hover transition-colors"
                >
                  <Link2 className="w-4 h-4" />
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                  bg-foreground text-card hover:opacity-90
                  transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <Pencil className="w-4 h-4" />
                {t('Edit profile', 'Editar perfil')}
              </a>
            ) : (
              <>
                <button
                  onClick={handleConnect}
                  disabled={connecting || connStatus === 'accepted' || connStatus === 'pending'}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                    transition-all duration-200 shadow-sm hover:shadow-md
                    ${connStatus === 'accepted'
                      ? 'bg-success/20 text-success border border-success/30'
                      : connStatus === 'pending'
                        ? 'bg-surface text-muted border border-border'
                        : 'bg-primary text-white hover:bg-primary-hover'
                    }
                    disabled:cursor-not-allowed`}
                >
                  <UserPlus className="w-4 h-4" />
                  {connecting ? '...' : getConnectButtonText()}
                </button>
                <button
                  onClick={handleMessage}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                    bg-card text-foreground border border-border
                    hover:bg-surface transition-all duration-200"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('Message', 'Mensaje')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
