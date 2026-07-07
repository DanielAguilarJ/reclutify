'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';

/**
 * Shows a small, non-blocking banner when one or more writes to Supabase
 * (candidate updates/inserts) failed after retrying and are sitting in the
 * local sync queue (see adminStore.ts — SYNC_QUEUE_KEY). This makes sync
 * failures visible to the recruiter instead of failing silently, and offers
 * a manual "Retry" action on top of the automatic retry that already runs
 * whenever the dashboard loads.
 */
export default function SyncStatusBanner() {
  const { pendingSyncCount, retrySyncQueue } = useAdminStore();
  const { language } = useAppStore();
  const [isRetrying, setIsRetrying] = useState(false);

  if (!pendingSyncCount) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retrySyncQueue();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <p className="text-sm text-foreground">
          {language === 'es'
            ? `${pendingSyncCount} ${pendingSyncCount === 1 ? 'cambio' : 'cambios'} sin sincronizar con la base de datos.`
            : `${pendingSyncCount} ${pendingSyncCount === 1 ? 'change' : 'changes'} not yet synced to the database.`}
        </p>
      </div>
      <button
        onClick={handleRetry}
        disabled={isRetrying}
        className="inline-flex items-center gap-1.5 rounded-lg bg-warning/20 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/30 disabled:opacity-50 shrink-0"
      >
        {isRetrying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {language === 'es' ? 'Reintentar ahora' : 'Retry now'}
      </button>
    </div>
  );
}
