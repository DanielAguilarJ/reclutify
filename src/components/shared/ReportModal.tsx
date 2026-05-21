'use client';
import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';

interface Props {
  contentType: string;
  contentId: string;
  onClose: () => void;
}

export function ReportModal({ contentType, contentId, onClose }: Props) {
  const { language } = useAppStore();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const reasons = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: language === 'es' ? 'Acoso' : 'Harassment' },
    { value: 'inappropriate', label: language === 'es' ? 'Contenido inapropiado' : 'Inappropriate content' },
    { value: 'misinformation', label: language === 'es' ? 'Informacion falsa' : 'Misinformation' },
    { value: 'hate_speech', label: language === 'es' ? 'Discurso de odio' : 'Hate speech' },
    { value: 'other', label: language === 'es' ? 'Otro' : 'Other' },
  ];

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    await supabase.from('reports').insert({ reporter_id: user.id, content_type: contentType, content_id: contentId, reason, description });
    setSubmitted(true);
    setLoading(false);
    setTimeout(onClose, 2000);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-card rounded-xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3"><Flag className="h-6 w-6 text-success" /></div>
          <p className="text-sm font-medium text-foreground">{language === 'es' ? 'Reporte enviado' : 'Report submitted'}</p>
          <p className="text-xs text-muted mt-1">{language === 'es' ? 'Gracias por ayudar a mantener la comunidad segura' : 'Thank you for helping keep our community safe'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Flag className="h-4 w-4 text-danger" />{language === 'es' ? 'Reportar' : 'Report'}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 mb-4">
          {reasons.map((r) => (
            <button key={r.value} onClick={() => setReason(r.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${reason === r.value ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted/5 text-foreground border border-border/30 hover:border-primary/20'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={language === 'es' ? 'Detalles adicionales (opcional)' : 'Additional details (optional)'}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[60px] resize-none mb-4 focus:outline-none focus:ring-1 focus:ring-primary/30" />
        <button onClick={handleSubmit} disabled={!reason || loading}
          className="w-full py-2 rounded-lg bg-danger text-white text-sm font-medium disabled:opacity-50 hover:bg-danger/90 transition-colors">
          {loading ? '...' : (language === 'es' ? 'Enviar Reporte' : 'Submit Report')}
        </button>
      </div>
    </div>
  );
}
