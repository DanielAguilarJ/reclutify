'use client';

import { useEffect, useRef } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { createClient } from '@/utils/supabase/client';
import type { Role } from '@/types';

/**
 * Hook que sincroniza los roles con Supabase:
 * 1. Carga roles desde la nube al montar
 * 2. Escucha cambios en tiempo real via Supabase Realtime
 * 3. Limpia suscripciones al desmontar
 */
export function useRoles() {
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
      .channel('roles-realtime')
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
  }, [orgId]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    createdAt: new Date(row.created_at as string).getTime(),
  };
}
