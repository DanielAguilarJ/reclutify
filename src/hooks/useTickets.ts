'use client';

import { useEffect, useRef } from 'react';
import { useTicketStore } from '@/store/ticketStore';

/**
 * Hook que sincroniza los tickets con Supabase:
 * 1. Carga tickets desde la nube al montar
 * 2. Maneja estados de carga y error
 */
export function useTickets() {
  const { tickets, loading, error, fetchTickets } = useTicketStore();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Cargar tickets desde Supabase
    fetchTickets();
  }, [fetchTickets]);

  return { tickets, loading, error };
}
