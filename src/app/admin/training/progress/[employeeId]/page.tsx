'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Lock,
  Circle,
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Award,
  Brain,
  MessageSquare,
  User,
  Bot,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';
import type { TrainingProgress, TrainingEmployee, TrainingModule } from '@/types';

export default function EmployeeProgressPage() {
  const { language } = useAppStore();
  const { employees, modules, loading, fetchTrainingData, fetchEmployeeProgress } = useTrainingAdminStore();
  const params = useParams();
  const employeeId = params.employeeId as string;

  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [showConversation, setShowConversation] = useState(false);

  const employee = employees.find((e) => e.id === employeeId);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  useEffect(() => {
    if (employeeId) {
      setLoadingProgress(true);
      fetchEmployeeProgress(employeeId).then((data) => {
        setProgress(data);
        setLoadingProgress(false);
      });
    }
  }, [employeeId, fetchEmployeeProgress]);

  const getModuleForProgress = (moduleId: string): TrainingModule | undefined => {
    return modules.find((m) => m.id === moduleId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'locked':
        return <Lock className="h-5 w-5 text-muted" />;
      case 'available':
        return <Circle className="h-5 w-5 text-blue-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-warning animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success" />;
      default:
        return <Circle className="h-5 w-5 text-muted" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'locked':
        return language === 'es' ? 'Bloqueado' : 'Locked';
      case 'available':
        return language === 'es' ? 'Disponible' : 'Available';
      case 'in_progress':
        return language === 'es' ? 'En Progreso' : 'In Progress';
      case 'completed':
        return language === 'es' ? 'Completado' : 'Completed';
      default:
        return status;
    }
  };

  const getEmployeeStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
            {language === 'es' ? 'Activo' : 'Active'}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
            {language === 'es' ? 'Completado' : 'Completed'}
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/20 text-muted">
            {language === 'es' ? 'Pausado' : 'Paused'}
          </span>
        );
      case 'not_started':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
            {language === 'es' ? 'Sin Iniciar' : 'Not Started'}
          </span>
        );
      default:
        return null;
    }
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // Circular progress SVG
  const CircularProgress = ({ value, size = 80 }: { value: number; size?: number }) => {
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-border/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-primary transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-foreground">{value}%</span>
        </div>
      </div>
    );
  };

  if (loading || loadingProgress) {
    return (
      <div className="animate-in fade-in duration-500 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-border/30 rounded-xl animate-pulse" />
          <div className="h-7 w-48 bg-border/30 rounded-lg animate-pulse" />
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-border/30 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-40 bg-border/30 rounded animate-pulse" />
              <div className="h-4 w-32 bg-border/30 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-border/30 animate-pulse" />
              <div className="h-16 flex-1 bg-border/30 rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="animate-in fade-in duration-500 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin/training"
            className="p-2 rounded-xl hover:bg-background border border-border/50 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">
            {language === 'es' ? 'Empleado no encontrado' : 'Employee not found'}
          </h1>
        </div>
        <p className="text-sm text-muted">
          {language === 'es'
            ? 'No se encontro el empleado solicitado.'
            : 'The requested employee was not found.'}
        </p>
      </div>
    );
  }

  const initials = employee.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="animate-in fade-in duration-500 p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/training"
          className="p-2 rounded-xl hover:bg-background border border-border/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">{employee.name}</h1>
          <p className="text-sm text-muted">{employee.roleTitle || (language === 'es' ? 'Sin puesto asignado' : 'No role assigned')}</p>
        </div>
      </div>

      {/* Employee Overview Card */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar + Info */}
          <div className="flex items-center gap-4 flex-1">
            <div className="h-16 w-16 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-primary">{initials}</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{employee.name}</p>
              <p className="text-sm text-muted">{employee.email}</p>
              <div className="flex items-center gap-2 mt-1">
                {employee.roleTitle && (
                  <span className="text-xs text-muted bg-background px-2 py-0.5 rounded-full border border-border/50">
                    {employee.roleTitle}
                  </span>
                )}
                <span className="text-xs text-muted">
                  {language === 'es' ? 'Contratado:' : 'Hired:'}{' '}
                  {new Date(employee.hiredAt).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Progress Ring + Score + Status */}
          <div className="flex items-center gap-5">
            <CircularProgress value={employee.overallProgress} />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {employee.overallScore != null ? `${employee.overallScore}%` : '—'}
              </p>
              <p className="text-xs text-muted">{language === 'es' ? 'Score General' : 'Overall Score'}</p>
              <div className="mt-2">
                {getEmployeeStatusBadge(employee.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Personalization Notes */}
        {(employee.personalizationNotes?.strengths?.length ||
          employee.personalizationNotes?.areasToWatch?.length ||
          employee.personalizationNotes?.learningStyle) && (
          <div className="mt-5 pt-5 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {employee.personalizationNotes.strengths && employee.personalizationNotes.strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Fortalezas' : 'Strengths'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {employee.personalizationNotes.strengths.map((s, i) => (
                    <span key={i} className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {employee.personalizationNotes.areasToWatch && employee.personalizationNotes.areasToWatch.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Areas a Observar' : 'Areas to Watch'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {employee.personalizationNotes.areasToWatch.map((a, i) => (
                    <span key={i} className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {employee.personalizationNotes.learningStyle && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Estilo de Aprendizaje' : 'Learning Style'}
                </p>
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-foreground">{employee.personalizationNotes.learningStyle}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Module Progress Timeline */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
        <h2 className="text-base font-semibold text-foreground mb-4">
          {language === 'es' ? 'Progreso por Modulo' : 'Module Progress'}
        </h2>

        {progress.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted">
              {language === 'es' ? 'No hay progreso registrado aun.' : 'No progress recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-3 bottom-3 w-0.5 bg-border/50" />

            <div className="space-y-0">
              {progress.map((prog, idx) => {
                const mod = getModuleForProgress(prog.moduleId);
                const isCurrentModule = prog.status === 'in_progress';

                return (
                  <div
                    key={prog.id}
                    className={`relative flex gap-4 py-4 ${
                      isCurrentModule ? 'bg-primary/5 -mx-3 px-3 rounded-xl ring-1 ring-primary/20' : ''
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="relative z-10 flex-shrink-0 mt-0.5 bg-card rounded-full">
                      {getStatusIcon(prog.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {mod?.title || (language === 'es' ? 'Modulo desconocido' : 'Unknown module')}
                          </p>
                          {mod?.description && (
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">{mod.description}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted flex-shrink-0">
                          {getStatusLabel(prog.status)}
                        </span>
                      </div>

                      {/* Stats for completed/in_progress */}
                      {(prog.status === 'completed' || prog.status === 'in_progress') && (
                        <div className="flex items-center gap-4 mt-2">
                          {prog.score != null && (
                            <div className="flex items-center gap-1">
                              <Award className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-medium text-foreground">{prog.score}%</span>
                            </div>
                          )}
                          {prog.timeSpent > 0 && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted" />
                              <span className="text-xs text-muted">{formatTime(prog.timeSpent)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI Feedback */}
                      {prog.aiFeedback && (
                        <div className="mt-2 p-2.5 rounded-lg bg-background border border-border/50">
                          <div className="flex items-start gap-2">
                            <Bot className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted line-clamp-2">{prog.aiFeedback}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Evaluation Results Section */}
      {progress.filter((p) => p.status === 'completed' && p.score != null).length > 0 && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50">
            <h2 className="text-base font-semibold text-foreground">
              {language === 'es' ? 'Resultados de Evaluaciones' : 'Evaluation Results'}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Modulo' : 'Module'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    Score
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Resultado' : 'Result'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Tiempo' : 'Time'}
                  </th>
                  <th className="text-right text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Detalle' : 'Detail'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {progress
                  .filter((p) => p.status === 'completed' && p.score != null)
                  .map((prog) => {
                    const mod = getModuleForProgress(prog.moduleId);
                    const passed = (prog.score || 0) >= 70;
                    return (
                      <tr key={prog.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-foreground">
                            {mod?.title || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-semibold ${passed ? 'text-success' : 'text-red-500'}`}>
                            {prog.score}%
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            passed ? 'bg-success/10 text-success' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {passed
                              ? (language === 'es' ? 'Aprobado' : 'Passed')
                              : (language === 'es' ? 'Reprobado' : 'Failed')}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-sm text-muted">{formatTime(prog.timeSpent)}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setExpandedEval(expandedEval === prog.id ? null : prog.id)}
                            className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
                          >
                            {expandedEval === prog.id
                              ? (language === 'es' ? 'Ocultar' : 'Hide')
                              : (language === 'es' ? 'Ver' : 'View')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Expanded evaluation detail */}
          {expandedEval && (() => {
            const prog = progress.find((p) => p.id === expandedEval);
            const mod = prog ? getModuleForProgress(prog.moduleId) : undefined;
            if (!mod || !mod.evaluationQuestions.length) return null;
            return (
              <div className="px-5 pb-5 border-t border-border/50">
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-medium text-muted uppercase tracking-wider">
                    {language === 'es' ? 'Preguntas de Evaluacion' : 'Evaluation Questions'}
                  </p>
                  {mod.evaluationQuestions.map((q, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-background border border-border/50">
                      <p className="text-sm text-foreground font-medium mb-1">
                        {idx + 1}. {q.question}
                      </p>
                      <p className="text-xs text-muted">
                        <span className="font-medium">{language === 'es' ? 'Respuesta correcta:' : 'Correct answer:'}</span>{' '}
                        {q.correctAnswer}
                      </p>
                      {q.explanation && (
                        <p className="text-xs text-muted mt-1 italic">{q.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* AI Conversation History */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
        <button
          onClick={() => setShowConversation(!showConversation)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {language === 'es' ? 'Historial de Conversacion con AI' : 'AI Conversation History'}
            </h2>
          </div>
          {showConversation ? (
            <ChevronUp className="h-4 w-4 text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted" />
          )}
        </button>

        {showConversation && (
          <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {/* Placeholder conversation based on interview data */}
            {employee.interviewData?.transcript && employee.interviewData.transcript.length > 0 ? (
              employee.interviewData.transcript.slice(0, 20).map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role !== 'user' && (
                    <div className="h-7 w-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-background border border-border/50 text-foreground rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-7 w-7 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">
                  {language === 'es'
                    ? 'No hay conversaciones registradas aun.'
                    : 'No conversations recorded yet.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
