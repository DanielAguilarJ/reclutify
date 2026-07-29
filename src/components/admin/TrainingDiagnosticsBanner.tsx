'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info, ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

/**
 * Banner de diagnóstico del entorno de capacitación.
 *
 * Consulta `GET /api/training/diagnostics` al montar y, cuando algún check
 * está en `missing`, muestra qué falta y la migración o acción que lo provee
 * (Requisito 1.6). Así un panel vacío deja de ser inexplicable: si las tablas
 * o el bucket no están instalados, el banner lo dice en lugar de dejar una
 * lista vacía sin motivo (Requisito 11.3).
 *
 * Decisiones deliberadas:
 *
 * - **No bloquea el panel.** El fetch es independiente de la carga de datos.
 *   Si falla por red, 403 o 500, el banner simplemente no aparece y el error
 *   queda en la consola. Un diagnóstico inaccesible no es un problema que el
 *   administrador pueda resolver desde esta pantalla.
 * - **Un `403` no se muestra.** Significa que el usuario no es `owner` ni
 *   `admin`; el reporte revela estructura interna de la base de datos y esa
 *   negativa ya la comunica el resto del módulo (Requisito 11.4).
 * - **`unknown` no es un fallo.** Aparece cuando el diagnóstico se obtuvo por
 *   sondeo y no pudo determinar nulabilidad de columnas ni índices. Solo se
 *   listan los `missing`.
 * - **`critical` y `warning` se distinguen visualmente.** Una advertencia
 *   suelta (p. ej. `OPENROUTER_API_KEY` ausente) es degradación aceptada, no
 *   un módulo roto.
 * - **Colapsable.** El catálogo tiene más de treinta checks; en una base sin
 *   migraciones aplicadas la lista completa empujaría el panel fuera de
 *   pantalla. Se muestra el resumen y el detalle se expande a petición.
 *
 * Los tipos de la respuesta se declaran aquí en lugar de importarse de
 * `src/lib/training/diagnostics.ts` porque ese módulo es `server-only`.
 */

type DiagnosticsSeverity = 'critical' | 'warning';

type DiagnosticsStatus = 'ok' | 'missing' | 'unknown';

interface DiagnosticsCheck {
  id: string;
  label: string;
  severity: DiagnosticsSeverity;
  remediation: string;
  status: DiagnosticsStatus;
  detail?: string;
}

interface DiagnosticsResponse {
  ok: boolean;
  source: 'rpc' | 'probe';
  checks: DiagnosticsCheck[];
  summary: { passed: number; failed: number; warnings: number };
}

const DETAIL_PANEL_ID = 'training-diagnostics-detail';

function isDiagnosticsResponse(value: unknown): value is DiagnosticsResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DiagnosticsResponse>;
  return Array.isArray(candidate.checks) && typeof candidate.ok === 'boolean';
}

export default function TrainingDiagnosticsBanner() {
  const { language } = useAppStore();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadDiagnostics = async () => {
      try {
        const res = await fetch('/api/training/diagnostics', {
          signal: controller.signal,
        });

        if (!res.ok) {
          // 401/403 (sin rol owner/admin) o 5xx: no hay banner que mostrar.
          console.warn(
            `[training/diagnostics] Environment report unavailable (${res.status}); skipping banner.`,
          );
          return;
        }

        const data: unknown = await res.json();

        if (!isDiagnosticsResponse(data)) {
          console.warn('[training/diagnostics] Unexpected report shape; skipping banner.');
          return;
        }

        setDiagnostics(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[training/diagnostics] Could not load environment report:', err);
      }
    };

    loadDiagnostics();

    return () => controller.abort();
  }, []);

  if (!diagnostics) return null;

  const failingChecks = diagnostics.checks.filter((check) => check.status === 'missing');

  if (failingChecks.length === 0) return null;

  const criticalChecks = failingChecks.filter((check) => check.severity === 'critical');
  const warningChecks = failingChecks.filter((check) => check.severity === 'warning');
  const hasCritical = criticalChecks.length > 0;

  // Los críticos primero: son los que rompen el flujo.
  const orderedChecks = [...criticalChecks, ...warningChecks];

  const tone = hasCritical
    ? {
        container: 'border-danger/30 bg-danger/10',
        accent: 'text-danger',
        button: 'bg-danger/20 text-danger hover:bg-danger/30',
        pill: 'bg-danger/15 text-danger',
      }
    : {
        container: 'border-warning/30 bg-warning/10',
        accent: 'text-warning',
        button: 'bg-warning/20 text-warning hover:bg-warning/30',
        pill: 'bg-warning/15 text-warning',
      };

  const headline = hasCritical
    ? language === 'es'
      ? `El entorno de capacitación tiene ${criticalChecks.length} ${criticalChecks.length === 1 ? 'elemento crítico sin instalar' : 'elementos críticos sin instalar'}.`
      : `The training environment is missing ${criticalChecks.length} critical ${criticalChecks.length === 1 ? 'item' : 'items'}.`
    : language === 'es'
      ? `El entorno de capacitación funciona con ${warningChecks.length} ${warningChecks.length === 1 ? 'advertencia' : 'advertencias'}.`
      : `The training environment is working with ${warningChecks.length} ${warningChecks.length === 1 ? 'warning' : 'warnings'}.`;

  const subline = hasCritical
    ? warningChecks.length > 0
      ? language === 'es'
        ? `También hay ${warningChecks.length} ${warningChecks.length === 1 ? 'advertencia' : 'advertencias'}. Hasta aplicar las migraciones indicadas, el flujo de capacitación puede fallar.`
        : `There ${warningChecks.length === 1 ? 'is' : 'are'} also ${warningChecks.length} ${warningChecks.length === 1 ? 'warning' : 'warnings'}. Until the listed migrations are applied, the training flow may fail.`
      : language === 'es'
        ? 'Hasta aplicar las migraciones indicadas, el flujo de capacitación puede fallar.'
        : 'Until the listed migrations are applied, the training flow may fail.'
    : language === 'es'
      ? 'Ningún elemento crítico falta; se trata de degradaciones aceptables.'
      : 'No critical item is missing; these are acceptable degradations.';

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${tone.container}`}
      role={hasCritical ? 'alert' : 'status'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {hasCritical ? (
            <ShieldAlert className={`h-4 w-4 shrink-0 mt-0.5 ${tone.accent}`} />
          ) : (
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${tone.accent}`} />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{headline}</p>
            <p className="text-xs text-muted mt-0.5">{subline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={DETAIL_PANEL_ID}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors ${tone.button}`}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded
            ? language === 'es'
              ? 'Ocultar detalle'
              : 'Hide detail'
            : language === 'es'
              ? `Ver detalle (${failingChecks.length})`
              : `View detail (${failingChecks.length})`}
        </button>
      </div>

      {expanded && (
        <div id={DETAIL_PANEL_ID} className="mt-3 space-y-2">
          {orderedChecks.map((check) => (
            <div
              key={check.id}
              className="rounded-lg bg-card/60 border border-border/50 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{check.label}</p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                    check.severity === 'critical' ? tone.pill : 'bg-warning/15 text-warning'
                  }`}
                >
                  {check.severity === 'critical'
                    ? language === 'es'
                      ? 'Crítico'
                      : 'Critical'
                    : language === 'es'
                      ? 'Advertencia'
                      : 'Warning'}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                {language === 'es' ? 'Solución: ' : 'Fix: '}
                {check.remediation}
              </p>
              {check.detail && <p className="text-xs text-muted mt-0.5">{check.detail}</p>}
            </div>
          ))}

          {diagnostics.source === 'probe' && (
            <div className="flex items-start gap-2 rounded-lg bg-card/60 border border-border/50 px-3 py-2">
              <Info className="h-3.5 w-3.5 text-muted shrink-0 mt-0.5" />
              <p className="text-xs text-muted">
                {language === 'es'
                  ? 'Diagnóstico parcial: se obtuvo por sondeo, así que la nulabilidad de columnas y los índices no pudieron verificarse. Aplicar la migración 202607280001_training_environment_report.sql habilita el reporte completo.'
                  : 'Partial diagnostics: collected by probing, so column nullability and indexes could not be verified. Applying migration 202607280001_training_environment_report.sql enables the full report.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
