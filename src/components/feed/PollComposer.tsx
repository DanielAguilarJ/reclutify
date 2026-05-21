'use client';
import { useState } from 'react';
import { Plus, X, BarChart3 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

interface Props {
  onSubmit: (options: string[], endsInDays: number) => void;
  onCancel: () => void;
}

export function PollComposer({ onSubmit, onCancel }: Props) {
  const { language } = useAppStore();
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState(3);

  const addOption = () => { if (options.length < 6) setOptions([...options, '']); };
  const removeOption = (idx: number) => { if (options.length > 2) setOptions(options.filter((_, i) => i !== idx)); };
  const updateOption = (idx: number, val: string) => { const o = [...options]; o[idx] = val; setOptions(o); };

  const canSubmit = options.filter(o => o.trim()).length >= 2;

  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-primary" />{language === 'es' ? 'Encuesta' : 'Poll'}</span>
        <button onClick={onCancel} className="text-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {options.map((opt, idx) => (
        <div key={idx} className="flex gap-2">
          <input value={opt} onChange={(e) => updateOption(idx, e.target.value)} placeholder={`${language === 'es' ? 'Opcion' : 'Option'} ${idx + 1}`}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
          {options.length > 2 && <button onClick={() => removeOption(idx)} className="text-muted hover:text-danger"><X className="h-4 w-4" /></button>}
        </div>
      ))}
      {options.length < 6 && (
        <button onClick={addOption} className="flex items-center gap-1 text-xs text-primary font-medium hover:text-primary-hover">
          <Plus className="h-3 w-3" />{language === 'es' ? 'Agregar opcion' : 'Add option'}
        </button>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-border/30">
        <span className="text-xs text-muted">{language === 'es' ? 'Duracion:' : 'Duration:'}</span>
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="text-xs px-2 py-1 rounded border border-border bg-background">
          <option value={1}>1 {language === 'es' ? 'dia' : 'day'}</option>
          <option value={3}>3 {language === 'es' ? 'dias' : 'days'}</option>
          <option value={7}>7 {language === 'es' ? 'dias' : 'days'}</option>
        </select>
        <button onClick={() => canSubmit && onSubmit(options.filter(o => o.trim()), duration)} disabled={!canSubmit}
          className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50">
          {language === 'es' ? 'Crear encuesta' : 'Create poll'}
        </button>
      </div>
    </div>
  );
}
