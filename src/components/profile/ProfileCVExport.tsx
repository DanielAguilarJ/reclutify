'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

import type { Profile } from '@/types/profile';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/Toast';

/**
 * Botón de descarga del CV en PDF.
 *
 * La generación vive en `./ProfileCVDocument`, que se carga BAJO DEMANDA. Ver el
 * comentario de cabecera de ese archivo: importarla aquí metía ~300 KB de
 * `@react-pdf/renderer` en la primera carga de cada página pública de perfil.
 */
interface ProfileCVExportProps {
  profile: Profile;
}

export default function ProfileCVExport({ profile }: ProfileCVExportProps) {
  const [generating, setGenerating] = useState(false);
  const language = useAppStore((s) => s.language);
  const { showToast } = useToast();
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  const handleDownload = async () => {
    setGenerating(true);

    let url: string | null = null;

    try {
      // El import dinámico es lo que mantiene la librería fuera del bundle inicial.
      const { generateCvBlob } = await import('./ProfileCVDocument');

      const blob = await generateCvBlob(profile, language);
      url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${profile.full_name.replace(/\s+/g, '_')}_CV.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('PDF generation failed:', error);
      showToast('error', t('Failed to generate PDF', 'Error al generar el PDF'));
    } finally {
      // El `revokeObjectURL` estaba en el camino feliz, así que un fallo a mitad
      // dejaba la URL —y con ella el blob del PDF— retenida en memoria hasta
      // recargar la página. En `finally` se libera siempre.
      if (url) URL.revokeObjectURL(url);
      setGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={generating}
      aria-busy={generating}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
        bg-surface text-foreground border border-border
        hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed
        transition-all"
    >
      <Download className="w-4 h-4" aria-hidden="true" />
      {generating ? t('Generating...', 'Generando...') : t('Download CV', 'Descargar CV')}
    </button>
  );
}
