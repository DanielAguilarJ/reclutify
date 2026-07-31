'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { createClient } from '@/utils/supabase/client';

/**
 * Suscripción a cambios de una tabla vía Supabase Realtime.
 *
 * QUÉ ESTABA BIEN Y NO HACÍA FALTA ARREGLAR
 * -----------------------------------------
 * Las seis suscripciones del proyecto —`FeedRealtime`, `MessagesClient`,
 * `NotificationBell`, `useRoles`, `useCandidates` y `coachStore`— **sí** llaman a
 * `removeChannel` en su cleanup. Se comprobó una por una. La auditoría inicial las dio
 * por fugadas y no lo estaban.
 *
 * LOS DOS PROBLEMAS QUE SÍ TENÍAN
 * -------------------------------
 * 1. **Nombres de canal estáticos.** `'feed-realtime'`, `'notif-rt'`,
 *    `'roles-realtime'`, `'candidates-realtime'`. Dos instancias del mismo componente
 *    montadas a la vez —o el doble montaje del modo estricto de React en desarrollo—
 *    piden el MISMO canal, y la segunda suscripción no se establece. El síntoma es una
 *    lista que deja de actualizarse en tiempo real, sin error. Este hook añade un
 *    sufijo único por instancia con `useId`.
 *
 * 2. **El manejador en el array de dependencias.** Cuatro de los seis pasan una función
 *    en línea al efecto que crea el canal. Si esa función entra en las dependencias, el
 *    canal se destruye y se recrea EN CADA RENDER: una reconexión por pulsación de
 *    tecla en el componente padre. Aquí el manejador vive en un ref, así que cambiarlo
 *    no toca la suscripción.
 *
 * QUÉ NO HACE
 * -----------
 * No filtra por autorización: Realtime respeta las políticas RLS de la tabla, así que la
 * suscripción solo entrega las filas que el usuario puede leer. Si una tabla no tiene
 * RLS, este hook la expondrá igual que cualquier otra lectura — el control está en la
 * base, no aquí.
 */

/** Operaciones que se pueden observar. `'*'` incluye las tres. */
export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/** Estado de la suscripción. */
export type RealtimeStatus = 'idle' | 'subscribing' | 'subscribed' | 'error' | 'closed';

export interface UseSupabaseRealtimeOptions<Row extends Record<string, unknown>> {
  /** Tabla a observar. */
  table: string;
  /** Operación. Por defecto todas. */
  event?: RealtimeEvent;
  /**
   * Filtro en la sintaxis de Realtime, p. ej. `org_id=eq.abc`.
   *
   * Es una optimización de red, NO un control de acceso: reduce lo que el servidor
   * envía, pero lo que el usuario puede ver ya lo decide RLS.
   */
  filter?: string;
  /** Esquema. Por defecto `public`. */
  schema?: string;
  /** Se llama con cada cambio. Puede ser una función en línea sin coste. */
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
  /** Permite desactivar la suscripción sin desmontar el componente. */
  enabled?: boolean;
}

export interface UseSupabaseRealtimeResult {
  status: RealtimeStatus;
}

/**
 * Observa los cambios de una tabla.
 *
 * @example
 * useSupabaseRealtime<Message>({
 *   table: 'messages',
 *   event: 'INSERT',
 *   filter: `conversation_id=eq.${conversationId}`,
 *   onChange: (payload) => appendMessage(payload.new),
 * });
 */
export function useSupabaseRealtime<Row extends Record<string, unknown> = Record<string, unknown>>(
  options: UseSupabaseRealtimeOptions<Row>,
): UseSupabaseRealtimeResult {
  const { table, event = '*', filter, schema = 'public', enabled = true } = options;

  const [status, setStatus] = useState<RealtimeStatus>('idle');

  // El manejador en un ref: es lo que permite pasar una función en línea sin provocar
  // una reconexión por render.
  const onChangeRef = useRef(options.onChange);

  // El ref se actualiza en un EFECTO, no durante el render.
  //
  // Asignar `ref.current = valor` en el cuerpo del componente es escribir durante el
  // render, que React no garantiza que ocurra una sola vez: con renderizado concurrente
  // puede descartar un render a medias y la escritura queda hecha de todas formas. El
  // efecto sin array de dependencias corre después de cada render confirmado, que es el
  // momento correcto.
  useEffect(() => {
    onChangeRef.current = options.onChange;
  });

  // Identificador estable y único por instancia del hook. Resuelve la colisión de
  // nombres de canal.
  const instanceId = useId();

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const supabase = createClient();

    // El nombre incluye la tabla y el filtro para que sea legible en el panel de
    // Supabase, y el `instanceId` para que dos instancias no se pisen.
    const channelName = `rt:${table}:${filter ?? 'all'}:${instanceId}`;

    setStatus('subscribing');

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        // El tipo del cliente de Supabase no acepta `event` como variable de unión sin
        // un ensanchamiento; se declara la forma que la librería espera.
        { event, schema, table, ...(filter ? { filter } : {}) } as {
          event: RealtimeEvent;
          schema: string;
          table: string;
          filter?: string;
        },
        (payload) => {
          onChangeRef.current(payload as RealtimePostgresChangesPayload<Row>);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('subscribed');
          return;
        }

        if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
          // Se registra: una suscripción que falla en silencio se manifiesta como una
          // lista que no se actualiza, que es de las cosas más difíciles de diagnosticar
          // desde un informe de usuario.
          console.error(`[useSupabaseRealtime] ${channelName} → ${subscriptionStatus}`);
          setStatus('error');
          return;
        }

        if (subscriptionStatus === 'CLOSED') setStatus('closed');
      });

    return () => {
      // `removeChannel` desuscribe Y libera el canal en el cliente. Solo
      // `channel.unsubscribe()` deja el objeto registrado, y el nombre sigue ocupado.
      supabase.removeChannel(channel);
    };
    // `options.onChange` NO va en las dependencias a propósito: vive en un ref. Ver el
    // comentario de cabecera.
  }, [table, event, filter, schema, enabled, instanceId]);

  return { status };
}
