/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Fragment, useState } from 'react';
import { Clock, MessageSquare, Zap, ChevronDown, ChevronUp, Bot, User, BrainCircuit, Activity, AlertTriangle, Copy, CheckCheck, Database } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

/** Zero-dependency time-ago formatter */
function timeAgo(dateStr: string, locale: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  const isEs = locale === 'es';

  if (diffSec < 60) return isEs ? 'hace unos segundos' : 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return isEs ? `hace ${mins} min` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isEs ? `hace ${hrs}h` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return isEs ? `hace ${days}d` : `${days}d ago`;
}

interface TelemetryLog {
  id: string;
  session_id: string;
  candidate_name: string | null;
  role_title: string | null;
  turn_index: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
  reasoning_text: string | null;
  prompt_text: string | null;
  response_text: string | null;
  error_text: string | null;
  duration_ms: number;
  raw_payload: any;
  created_at: string;
}

export default function TelemetryDashboard({ initialLogs }: { initialLogs: TelemetryLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { language } = useAppStore();

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getLatencyColor = (duration: number) => {
    if (!duration || duration <= 0) return 'text-muted bg-muted/10';
    if (duration > 15000) return 'text-danger bg-danger/10';
    if (duration > 8000) return 'text-warning bg-warning/10';
    return 'text-success bg-success/10';
  };

  /**
   * Build a full debug report that can be pasted directly into an AI for debugging.
   * Includes every piece of data: raw payload, system prompt, reasoning, response, error, tokens.
   */
  const buildDebugReport = (log: TelemetryLog): string => {
    const sections = [
      `═══════════════════════════════════════════════════`,
      `RECLUTIFY AI TELEMETRY — DEBUG REPORT`,
      `═══════════════════════════════════════════════════`,
      ``,
      `📋 SESSION INFO`,
      `  Session ID:     ${log.session_id}`,
      `  Candidate:      ${log.candidate_name || 'N/A'}`,
      `  Role:           ${log.role_title || 'N/A'}`,
      `  Turn:           #${log.turn_index}`,
      `  Model:          ${log.model}`,
      `  Timestamp:      ${log.created_at}`,
      ``,
      `⏱️ PERFORMANCE`,
      `  Latency:        ${log.duration_ms ? (log.duration_ms / 1000).toFixed(2) + 's' : 'N/A'}`,
      `  Prompt Tokens:  ${log.prompt_tokens}`,
      `  Completion:     ${log.completion_tokens}`,
      `  Reasoning:      ${log.reasoning_tokens}`,
      `  Total Tokens:   ${log.total_tokens}`,
    ];

    if (log.error_text) {
      sections.push(
        ``,
        `🚨 ERROR`,
        `───────────────────────────────────────────────────`,
        log.error_text,
        `───────────────────────────────────────────────────`,
      );
    }

    if (log.prompt_text) {
      sections.push(
        ``,
        `📝 SYSTEM PROMPT + USER MESSAGE (sent to model)`,
        `───────────────────────────────────────────────────`,
        log.prompt_text,
        `───────────────────────────────────────────────────`,
      );
    }

    if (log.reasoning_text) {
      sections.push(
        ``,
        `🧠 AI INTERNAL REASONING (model's thinking before responding)`,
        `───────────────────────────────────────────────────`,
        log.reasoning_text,
        `───────────────────────────────────────────────────`,
      );
    }

    if (log.response_text) {
      sections.push(
        ``,
        `💬 FINAL AI RESPONSE (what was sent to the candidate)`,
        `───────────────────────────────────────────────────`,
        log.response_text,
        `───────────────────────────────────────────────────`,
      );
    }

    if (log.raw_payload) {
      sections.push(
        ``,
        `📦 RAW FRONTEND PAYLOAD (exact JSON sent from InterviewRoom to /api/chat)`,
        `───────────────────────────────────────────────────`,
        JSON.stringify(log.raw_payload, null, 2),
        `───────────────────────────────────────────────────`,
      );
    }

    sections.push(
      ``,
      `═══════════════════════════════════════════════════`,
      `END OF DEBUG REPORT`,
      `═══════════════════════════════════════════════════`,
    );

    return sections.join('\n');
  };

  const handleCopyForAI = async (log: TelemetryLog) => {
    const report = buildDebugReport(log);
    await navigator.clipboard.writeText(report);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/30 border-b border-border/50 text-muted uppercase text-xs font-semibold">
            <tr>
              <th className="px-6 py-4">{language === 'es' ? 'Candidato / Sesión' : 'Candidate / Session'}</th>
              <th className="px-6 py-4">{language === 'es' ? 'Turno' : 'Turn'}</th>
              <th className="px-6 py-4">{language === 'es' ? 'Latencia' : 'Latency'}</th>
              <th className="px-6 py-4">Tokens</th>
              <th className="px-6 py-4">{language === 'es' ? 'Hora' : 'Time'}</th>
              <th className="px-6 py-4 text-right">{language === 'es' ? 'Detalles' : 'Details'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {initialLogs.map((log) => (
              <Fragment key={log.id}>
                <tr 
                  className={`hover:bg-muted/10 transition-colors cursor-pointer ${expandedId === log.id ? 'bg-muted/10' : ''} ${log.error_text ? 'border-l-2 border-l-danger' : ''}`}
                  onClick={() => toggleExpand(log.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground flex items-center gap-1.5">
                        {log.error_text && <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />}
                        {log.candidate_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted truncate max-w-[200px]" title={log.session_id}>
                        {log.role_title || log.session_id?.substring(0, 12) + '...'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 font-medium">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      #{log.turn_index}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getLatencyColor(log.duration_ms)}`}>
                      <Activity className="h-3.5 w-3.5" />
                      {log.duration_ms ? (log.duration_ms / 1000).toFixed(1) + 's' : '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 text-xs text-muted">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-yellow-500" />
                        <span><span className="text-foreground font-medium">{log.total_tokens || 0}</span> total</span>
                      </div>
                      <div className="pl-5 opacity-70">
                        {log.reasoning_tokens > 0 ? `${log.reasoning_tokens} reasoning` : `${log.completion_tokens || 0} out`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {log.created_at ? timeAgo(log.created_at, language) : '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-muted hover:text-foreground transition-colors p-1">
                      {expandedId === log.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </button>
                  </td>
                </tr>

                {expandedId === log.id && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 bg-muted/5 border-b border-border/50">
                      {/* Action Bar */}
                      <div className="flex items-center gap-3 mb-6">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyForAI(log); }}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            copiedId === log.id
                              ? 'bg-success/20 text-success'
                              : 'bg-primary text-white hover:bg-primary/90'
                          }`}
                        >
                          {copiedId === log.id
                            ? <><CheckCheck className="h-4 w-4" /> {language === 'es' ? '¡Copiado!' : 'Copied!'}</>
                            : <><Copy className="h-4 w-4" /> {language === 'es' ? 'Copiar Todo para IA' : 'Copy All for AI'}</>
                          }
                        </button>
                        {log.raw_payload && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(JSON.stringify(log.raw_payload, null, 2));
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-muted/20 hover:bg-muted/30 text-muted hover:text-foreground transition-colors"
                          >
                            <Database className="h-3.5 w-3.5" /> Raw JSON
                          </button>
                        )}
                        <span className="text-xs text-muted ml-auto">
                          Model: <span className="font-mono text-foreground">{log.model}</span>
                        </span>
                      </div>

                      {/* Error Banner */}
                      {log.error_text && (
                        <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-lg">
                          <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-danger">
                            <AlertTriangle className="h-4 w-4" /> {language === 'es' ? 'Error Detectado' : 'Error Detected'}
                          </h4>
                          <pre className="font-mono text-xs whitespace-pre-wrap text-danger/80 max-h-[200px] overflow-y-auto">
                            {log.error_text}
                          </pre>
                        </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Prompt */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-primary">
                              <User className="h-4 w-4" /> {language === 'es' ? 'Prompt del Sistema + Contexto' : 'System Prompt + Context'}
                            </h4>
                            <div className="bg-background rounded-lg p-4 border border-border/50 max-h-[400px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-muted leading-relaxed">
                              {log.prompt_text || (language === 'es' ? 'Sin datos de prompt' : 'No prompt data')}
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Reasoning + Response */}
                        <div className="space-y-4">
                          {log.reasoning_text && (
                            <div>
                              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-purple-500">
                                <BrainCircuit className="h-4 w-4" /> {language === 'es' ? 'Razonamiento Interno de la IA' : 'AI Internal Reasoning'}
                              </h4>
                              <div className="bg-purple-500/5 rounded-lg p-4 border border-purple-500/20 max-h-[250px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-purple-700 dark:text-purple-300 leading-relaxed">
                                {log.reasoning_text}
                              </div>
                            </div>
                          )}

                          <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-success">
                              <Bot className="h-4 w-4" /> {language === 'es' ? 'Respuesta Final' : 'Final Output'}
                            </h4>
                            <div className="bg-success/5 rounded-lg p-4 border border-success/20 max-h-[250px] overflow-y-auto text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                              {log.response_text || (language === 'es' ? 'Sin respuesta' : 'No response')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            
            {initialLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <Activity className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">{language === 'es' ? 'Sin datos de telemetría' : 'No telemetry data yet'}</p>
                    <p className="text-xs opacity-70">{language === 'es' ? 'Inicia una entrevista para ver los datos aquí.' : 'Start an interview to see data here.'}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
