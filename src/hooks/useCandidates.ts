'use client';

import { useEffect, useRef } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { createClient } from '@/utils/supabase/client';
import type { CandidateResult } from '@/types';

/**
 * Hook que sincroniza los resultados de candidatos con Supabase:
 * 1. Carga candidatos desde la nube al montar
 * 2. Escucha cambios en tiempo real via Supabase Realtime
 * 3. Limpia suscripciones al desmontar
 */
export function useCandidates() {
  const { candidates, loading, error, fetchFromSupabase, orgId } = useAdminStore();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // fetchFromSupabase carga tanto roles como candidatos
    fetchFromSupabase();
  }, [fetchFromSupabase]);

  useEffect(() => {
    if (!orgId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('candidates-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'candidate_results',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const state = useAdminStore.getState();

          if (payload.eventType === 'INSERT') {
            const newCandidate = candidateFromPayload(payload.new);
            const exists = state.candidates.some((c) => c.id === newCandidate.id);
            if (!exists) {
              useAdminStore.setState({
                candidates: [newCandidate, ...state.candidates],
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = candidateFromPayload(payload.new);
            useAdminStore.setState({
              candidates: state.candidates.map((c) =>
                c.id === updated.id ? updated : c
              ),
            });
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Re-sync to capture any events that arrived during connection setup
          await useAdminStore.getState().fetchFromSupabase();
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orgId]);

  return { candidates, loading, error };
}

/**
 * Helper: Convierte un payload de Realtime al formato de CandidateResult
 */
function candidateFromPayload(row: Record<string, unknown>): CandidateResult {
  return {
    id: row.id as string,
    candidate: {
      name: row.candidate_name as string,
      email: (row.candidate_email as string) || '',
      phone: (row.candidate_phone as string) || '',
      linkedinUrl: (row.candidate_linkedin as string) || undefined,
    },
    roleId: row.role_id as string,
    roleTitle: row.role_title as string,
    date: typeof row.date === 'number' && row.date < 1e12
      ? row.date * 1000  // Unix seconds → ms
      : (row.date as number),
    status: (row.status as CandidateResult['status']) || 'pending',
    duration: row.duration != null ? (row.duration as number) : undefined,
    videoUrl: (row.video_url as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluation: (row.evaluation as any) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcript: (row.transcript as any) || [],
  };
}
