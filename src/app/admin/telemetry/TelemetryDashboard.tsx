'use client';

import { useState } from 'react';
import { Clock, MessageSquare, Zap, ChevronDown, ChevronUp, Bot, User, BrainCircuit, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppStore } from '@/store/appStore';

export default function TelemetryDashboard({ initialLogs }: { initialLogs: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { language } = useAppStore();

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusColor = (duration: number) => {
    if (duration > 15000) return 'text-danger bg-danger/10';
    if (duration > 8000) return 'text-warning bg-warning/10';
    return 'text-success bg-success/10';
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/30 border-b border-border/50 text-muted uppercase text-xs font-semibold">
            <tr>
              <th className="px-6 py-4">Candidate / Session</th>
              <th className="px-6 py-4">Turn</th>
              <th className="px-6 py-4">Latency</th>
              <th className="px-6 py-4">Tokens</th>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {initialLogs.map((log) => (
              <React.Fragment key={log.id}>
                <tr 
                  className={`hover:bg-muted/10 transition-colors cursor-pointer ${expandedId === log.id ? 'bg-muted/10' : ''}`}
                  onClick={() => toggleExpand(log.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{log.candidate_name || 'Unknown'}</span>
                      <span className="text-xs text-muted truncate max-w-[150px]" title={log.session_id}>
                        {log.role_title || log.session_id.substring(0, 8) + '...'}
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
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(log.duration_ms)}`}>
                      <Activity className="h-3.5 w-3.5" />
                      {(log.duration_ms / 1000).toFixed(1)}s
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 text-xs text-muted">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-yellow-500" />
                        <span><span className="text-foreground font-medium">{log.total_tokens}</span> total</span>
                      </div>
                      <div className="pl-5 opacity-70">
                        {log.reasoning_tokens > 0 ? `${log.reasoning_tokens} reasoning` : `${log.completion_tokens} out`}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: language === 'es' ? es : undefined })}
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
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Prompt Column */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-primary">
                              <User className="h-4 w-4" /> User Prompt + Context
                            </h4>
                            <div className="bg-background rounded-lg p-4 border border-border/50 max-h-[300px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-muted">
                              {log.prompt_text}
                            </div>
                          </div>
                        </div>

                        {/* AI Response Column */}
                        <div className="space-y-4">
                          {log.reasoning_text && (
                            <div>
                              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-purple-500">
                                <BrainCircuit className="h-4 w-4" /> AI Internal Reasoning
                              </h4>
                              <div className="bg-purple-500/5 rounded-lg p-4 border border-purple-500/20 max-h-[200px] overflow-y-auto font-mono text-xs whitespace-pre-wrap text-purple-700 dark:text-purple-300">
                                {log.reasoning_text}
                              </div>
                            </div>
                          )}

                          <div>
                            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2 text-success">
                              <Bot className="h-4 w-4" /> Final Output
                            </h4>
                            <div className="bg-success/5 rounded-lg p-4 border border-success/20 max-h-[200px] overflow-y-auto text-sm whitespace-pre-wrap text-foreground">
                              {log.response_text}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            
            {initialLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted">
                  No telemetry logs found. Start an interview to see data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
