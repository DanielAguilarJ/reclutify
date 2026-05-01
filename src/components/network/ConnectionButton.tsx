'use client';

import { useState } from 'react';
import { sendConnectionRequest, acceptConnectionRequest, declineConnectionRequest, removeConnection } from '@/app/actions/connections';
import type { ConnectionStatus } from '@/types/connections';

interface ConnectionButtonProps {
  targetUserId: string;
  initialStatus: ConnectionStatus | 'none';
  connectionId?: string;
  isRequester?: boolean;
}

export function ConnectionButton({
  targetUserId,
  initialStatus,
  connectionId,
  isRequester,
}: ConnectionButtonProps) {
  const [status, setStatus] = useState(initialStatus);
  const [connId, setConnId] = useState(connectionId);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    setStatus('pending');
    const result = await sendConnectionRequest(targetUserId);
    if (!result.success) setStatus('none');
    setLoading(false);
  };

  const handleAccept = async () => {
    if (!connId) return;
    setLoading(true);
    setStatus('accepted');
    await acceptConnectionRequest(connId);
    setLoading(false);
  };

  const handleDecline = async () => {
    if (!connId) return;
    setLoading(true);
    setStatus('none');
    await declineConnectionRequest(connId);
    setConnId(undefined);
    setLoading(false);
  };

  const handleRemove = async () => {
    if (!connId || !confirm('¿Eliminar conexión?')) return;
    setLoading(true);
    setStatus('none');
    await removeConnection(connId);
    setConnId(undefined);
    setLoading(false);
  };

  if (status === 'accepted') {
    return (
      <button onClick={handleRemove} disabled={loading}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-10 text-neutral-60 border border-neutral-20 hover:bg-red-30/10 hover:text-red-50 hover:border-red-50/30 transition-all">
        ✓ Conectados
      </button>
    );
  }

  if (status === 'pending' && !isRequester) {
    return (
      <div className="flex gap-2">
        <button onClick={handleAccept} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-white hover:bg-blue-40 transition-all">
          Aceptar
        </button>
        <button onClick={handleDecline} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-white text-neutral-50 border border-neutral-20 hover:bg-neutral-10 transition-all">
          Rechazar
        </button>
      </div>
    );
  }

  if (status === 'pending' && isRequester) {
    return (
      <button disabled
        className="px-4 py-2 rounded-xl text-sm font-medium bg-neutral-10 text-neutral-40 border border-neutral-20 cursor-default">
        Solicitud enviada
      </button>
    );
  }

  return (
    <button onClick={handleConnect} disabled={loading}
      className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-white hover:bg-blue-40 disabled:opacity-50 transition-all shadow-sm hover:shadow-md">
      {loading ? '...' : '+ Conectar'}
    </button>
  );
}
