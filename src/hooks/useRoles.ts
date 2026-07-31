'use client';

import { useEffect, useRef, useId } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { createClient } from '@/utils/supabase/client';
import type { Role, InterviewMode } from '@/types';

/**
 * Hook que sincroniza los roles con Supabase:
 * 1. Carga roles desde la nube al montar
 * 2. Escucha cambios en tiempo real via Supabase Realtime
 * 3. Limpia suscripciones al desmontar
 */
export function useRoles() {
  // Identificador único de esta instancia, para el nombre del canal de Realtime.
  //
  // El nombre era estático, así que dos instancias montadas a la vez —o el doble montaje
  // del modo estricto de React en desarrollo— pedían el MISMO canal y la segunda
  // suscripción no se establecía. El síntoma es una lista que deja de actualizarse en
  // tiempo real, sin ningún error. `useId` da un valor estable por instancia.
  const channelId = useId();

  const { roles, loading, error, fetchFromSupabase, orgId } = useAdminStore();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Solo inicializar una vez
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Cargar datos desde Supabase
    fetchFromSupabase();
  }, [fetchFromSupabase]);

  useEffect(() => {
    // Suscribirse a cambios en tiempo real cuando tengamos orgId
    if (!orgId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`roles-realtime-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'roles',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const state = useAdminStore.getState();

          if (payload.eventType === 'INSERT') {
            // Solo agregar si no existe ya (evitar duplicados por optimistic update)
            const newRole = roleFromPayload(payload.new);
            const exists = state.roles.some((r) => r.id === newRole.id);
            if (!exists) {
              useAdminStore.setState({
                roles: [newRole, ...state.roles],
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = roleFromPayload(payload.new);
            useAdminStore.setState({
              roles: state.roles.map((r) =>
                r.id === updated.id ? updated : r
              ),
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Record<string, unknown>).id as string;
            useAdminStore.setState({
              roles: state.roles.filter((r) => r.id !== deletedId),
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup: desuscribirse al desmontar
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orgId, channelId]);

  return { roles, loading, error };
}

/**
 * Helper: Convierte un payload de Realtime al formato de Role
 */
function roleFromPayload(row: Record<string, unknown>): Role {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    location: (row.location as string) || undefined,
    salary: (row.salary as string) || undefined,
    jobType: (row.job_type as string) || undefined,
    interviewDuration: (row.interview_duration as number) ?? 30,
    interviewMode: ((row.interview_mode as string) || 'restricted') as InterviewMode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    createdAt: new Date(row.created_at as string).getTime(),
    isPublished: (row.is_published as boolean) ?? false,
    publishedAt: row.published_at ? new Date(row.published_at as string).getTime() : undefined,
    publicToken: (row.public_token as string) || undefined,
  };
}
