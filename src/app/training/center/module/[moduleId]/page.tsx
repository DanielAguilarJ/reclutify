'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Award,
  ChevronRight,
  AlertCircle,
  BookMarked,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import {
  useTrainingStore,
  type EvaluationDetail,
} from '@/store/trainingStore';
import type { TrainingQuestionPublic } from '@/types';

interface EvaluationFeedbackState {
  passed: boolean;
  score: number;
  passingScore: number;
  details: EvaluationDetail[];
}

type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface CitationType {
  fileName: string;
  snippet: string;
}

interface SectionType {
  title: string;
  body: string;
}

export default function TrainingModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = use(params);
  const router = useRouter();
  const { language } = useAppStore();
  const {
    employee,
    modules,
    progress,
    moduleMessages,
    moduleEvaluationReady,
    aiSpeaking,
    startModule,
    completeModule,
    completeModuleWithoutEvaluation,
    startModuleChat,
    sendModuleMessage,
    incrementTimeSpent,
    initializeFromSession,
  } = useTrainingStore();

  const [input, setInput] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('idle');

  // Estados locales para la nueva interfaz de evaluación
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluationFeedback, setEvaluationFeedback] = useState<EvaluationFeedbackState | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [submittingEvaluation, setSubmittingEvaluation] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootstrapStartedRef = useRef(false);
  const initializedModuleIdRef = useRef<string | null>(null);

  const currentModule = modules.find((m) => m.id === moduleId);
  const moduleProgress = progress.find((p) => p.moduleId === moduleId);
  const isCompleted = moduleProgress?.status === 'completed';

  const messages = moduleMessages[moduleId] || [];

  // Auto-scroll to bottom
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Primer efecto: bootstrap de sesión
  useEffect(() => {
    if (bootstrapStartedRef.current) return;

    bootstrapStartedRef.current = true;
    setBootstrapStatus('loading');

    void (async () => {
      try {
        const initialized = employee
          ? true
          : await initializeFromSession();

        if (!initialized) {
          setBootstrapStatus('failed');
          router.replace('/');
          return;
        }

        setBootstrapStatus('ready');
      } catch (error: unknown) {
        console.error(
          '[Training Module] Session bootstrap failed:',
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : 'Failed to initialize training session'
        );
        setBootstrapStatus('failed');
        router.replace('/');
      }
    })();
  }, [
    employee,
    initializeFromSession,
    router,
  ]);

  // Segundo efecto: validación e inicio del módulo
  useEffect(() => {
    if (bootstrapStatus !== 'ready' || !employee) return;
    if (initializedModuleIdRef.current === moduleId) return;

    const targetModule =
      modules.find((module) => module.id === moduleId);

    const targetProgress =
      progress.find((item) => item.moduleId === moduleId);

    if (
      !targetModule ||
      !targetProgress ||
      targetProgress.status === 'locked'
    ) {
      initializedModuleIdRef.current = moduleId;
      router.replace('/training/center');
      return;
    }

    initializedModuleIdRef.current = moduleId;

    void (async () => {
      try {
        if (targetProgress.status === 'available') {
          await startModule(moduleId);
        }

        const existingMessages =
          useTrainingStore.getState().moduleMessages[moduleId] ?? [];

        if (existingMessages.length === 0) {
          await startModuleChat(moduleId);
        }
      } catch (error: unknown) {
        initializedModuleIdRef.current = null;

        console.error(
          '[Training Module] Module initialization failed:',
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : 'Failed to initialize module'
        );
        setBootstrapStatus('failed');
      }
    })();
  }, [
    bootstrapStatus,
    employee,
    moduleId,
    modules,
    progress,
    router,
    startModule,
    startModuleChat,
  ]);

  // Increment timer every minute under visibility constraint
  useEffect(() => {
    if (!moduleProgress || moduleProgress.status !== 'in_progress' || isEvaluating || evaluationComplete) {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        incrementTimeSpent(moduleId, 1).catch((err) => {
          console.error('[Timer] Failed to increment timeSpent:', err);
        });
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [moduleId, moduleProgress?.status, isEvaluating, evaluationComplete, incrementTimeSpent]);

  // Send chat message
  const handleSend = useCallback(async () => {
    if (!input.trim() || aiSpeaking || !employee) return;
    const userText = input.trim();
    setInput('');
    setError(null);
    setFailedMessage(null);
    try {
      await sendModuleMessage(moduleId, userText);
    } catch (err: unknown) {
      setFailedMessage(userText);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [input, aiSpeaking, employee, sendModuleMessage, moduleId]);

  const handleRetryMessage = useCallback(async () => {
    if (!failedMessage || aiSpeaking || !employee) return;
    setError(null);
    try {
      await sendModuleMessage(moduleId, failedMessage);
      setFailedMessage(null);
    } catch (retryError: unknown) {
      setError(retryError instanceof Error ? retryError.message : 'Failed to send message');
    }
  }, [failedMessage, aiSpeaking, employee, moduleId, sendModuleMessage]);

  // Enviar evaluación al endpoint seguro
  const handleSubmitEvaluation = async () => {
    const questionsCount = currentModule?.evaluationQuestions?.length || 0;
    const answeredCount = Object.values(answers).filter((value) => value.trim().length > 0).length;

    if (answeredCount < questionsCount) {
      setEvaluationError(
        language === 'es'
          ? 'Por favor responde todas las preguntas antes de enviar.'
          : 'Please answer all questions before submitting.'
      );
      return;
    }

    setSubmittingEvaluation(true);
    setEvaluationError(null);

    try {
      const result = await completeModule(moduleId, answers);
      setEvaluationFeedback({
        passed: result.passed,
        score: result.score,
        passingScore: result.passingScore,
        details: result.feedback.details,
      });
      setEvaluationComplete(true);
      setIsEvaluating(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error grading evaluation';
      setEvaluationError(errMsg);
    } finally {
      setSubmittingEvaluation(false);
    }
  };

  // Completar módulo sin evaluación de forma transaccional
  const handleCompleteWithoutEvaluation = async () => {
    setSubmittingEvaluation(true);
    try {
      const ok = await completeModuleWithoutEvaluation(moduleId);
      if (ok) {
        showEvaluationSuccessFeedback();
      } else {
        setError(language === 'es' ? 'No se pudo completar el módulo' : 'Failed to complete module');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to complete module';
      setError(errMsg);
    } finally {
      setSubmittingEvaluation(false);
    }
  };

  const showEvaluationSuccessFeedback = () => {
    setEvaluationFeedback({
      passed: true,
      score: 100,
      passingScore: 100,
      details: [],
    });
    setEvaluationComplete(true);
    setIsEvaluating(false);
  };

  const handleRetryEvaluation = () => {
    setAnswers({});
    setEvaluationFeedback(null);
    setEvaluationComplete(false);
    setIsEvaluating(true);
    setEvaluationError(null);
  };

  if (
    bootstrapStatus === 'idle' ||
    bootstrapStatus === 'loading'
  ) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00D3D8] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (bootstrapStatus === 'failed') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col items-center gap-3 text-center max-w-md">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <h3 className="text-sm font-semibold">
            {language === 'es' ? 'Error al Cargar Módulo' : 'Error Loading Module'}
          </h3>
          <p className="text-xs text-muted">{error}</p>
          <button
            onClick={() => router.push('/training/center')}
            className="mt-2 px-4 py-2 bg-[#00D3D8] text-white text-xs font-semibold rounded-lg hover:bg-[#00B8BD] transition-colors"
          >
            {language === 'es' ? 'Volver al Centro' : 'Back to Center'}
          </button>
        </div>
      </div>
    );
  }

  if (!employee || !currentModule) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00D3D8] border-t-transparent animate-spin" />
      </div>
    );
  }

  const totalSections = currentModule.content?.sections?.length || 0;

  return (
    <div className="h-screen bg-background flex flex-col animate-in fade-in duration-500 text-foreground">
      {/* ─── Header ─── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50 px-4 py-3"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                router.push('/training/center');
              }}
              className="w-8 h-8 rounded-lg hover:bg-muted/10 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">
                {currentModule.title}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {totalSections > 0 && (
                  <span className="text-xs text-muted">
                    {totalSections}{' '}
                    {language === 'es' ? 'secciones de lectura' : 'reading sections'}
                  </span>
                )}
                <span className="text-xs text-muted flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {moduleProgress?.timeSpent ?? 0} min
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted && !isEvaluating && !evaluationComplete && (
              <>
                {currentModule.evaluationEnabled ? (
                  <div className="flex items-center gap-2">
                    {moduleEvaluationReady?.[moduleId] && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#00A5A8] font-medium">
                        <Sparkles className="w-3 h-3" />
                        {language === 'es' ? 'Zara cree que ya estás listo' : 'Zara thinks you\'re ready'}
                      </span>
                    )}
                    <button
                      onClick={() => setIsEvaluating(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00D3D8] to-[#00A5A8] text-white text-xs font-medium shadow-sm hover:opacity-90 transition-opacity"
                    >
                      <Award className="w-3.5 h-3.5" />
                      {language === 'es' ? 'Tomar Evaluación' : 'Take Evaluation'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleCompleteWithoutEvaluation}
                    disabled={submittingEvaluation}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {submittingEvaluation ? (
                      <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {language === 'es' ? 'Completar Módulo' : 'Complete Module'}
                  </button>
                )}
              </>
            )}
            {isEvaluating && (
              <button
                onClick={() => setIsEvaluating(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                {language === 'es' ? 'Volver a Estudiar' : 'Back to Study'}
              </button>
            )}
          </div>
        </div>
      </motion.header>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-border/50 bg-card/50 overflow-y-auto p-5">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold mb-1">
                {currentModule.title}
              </h2>
              {currentModule.description && (
                <p className="text-xs text-muted leading-relaxed">
                  {currentModule.description}
                </p>
              )}
            </div>

            {currentModule.content?.sections && currentModule.content.sections.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Lista de Lectura' : 'Reading List'}
                </h3>
                <div className="space-y-1.5">
                  {currentModule.content.sections.map((section: SectionType, i: number) => (
                    <div key={i} className="flex items-start gap-2 py-1.5">
                      <BookMarked className="w-3.5 h-3.5 text-muted mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-muted">
                        {section.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ─── Chat or Evaluation Area ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* MODO EVALUACIÓN ACTIVO */}
          {isEvaluating && !evaluationComplete && (
            <div className="flex-1 overflow-y-auto px-4 py-8">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#00D3D8]/10 to-indigo-500/10 border border-[#00D3D8]/20">
                  <Award className="w-8 h-8 text-[#00D3D8] shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold">
                      {language === 'es' ? 'Evaluación del Módulo' : 'Module Evaluation'}
                    </h3>
                    <p className="text-xs text-muted">
                      {language === 'es'
                        ? 'Responde las siguientes preguntas. Las abiertas serán calificadas por IA.'
                        : 'Answer the following questions. Open-ended questions will be graded by AI.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {currentModule.evaluationQuestions.map((q: TrainingQuestionPublic, idx: number) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-xl border border-border bg-card/30 space-y-4"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-light text-xs font-semibold text-primary shrink-0">
                          {idx + 1}
                        </span>
                        <p className="text-sm font-medium">{q.question}</p>
                      </div>

                      {/* Múltiple opción / Verdadero Falso */}
                      {(q.type === 'multiple_choice' || q.type === 'true_false') && (
                        <div className="grid gap-2 pl-7">
                           {(q.options || []).map((opt: string, optIdx: number) => (
                            <label
                              key={optIdx}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                answers[idx] === opt
                                  ? 'border-[#00D3D8] bg-[#00D3D8]/5 text-[#00D3D8]'
                                  : 'border-border/50 hover:bg-muted/10 text-muted hover:text-foreground'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${idx}`}
                                value={opt}
                                checked={answers[idx] === opt}
                                onChange={() => setAnswers((prev) => ({ ...prev, [idx]: opt }))}
                                className="text-[#00D3D8] focus:ring-[#00D3D8] h-4 w-4"
                              />
                              <span className="text-sm">{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Preguntas Abiertas */}
                      {q.type === 'open_ended' && (
                        <div className="pl-7">
                          <textarea
                            value={answers[idx] || ''}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [idx]: e.target.value }))}
                            placeholder={
                              language === 'es'
                                ? 'Escribe tu respuesta detallada...'
                                : 'Type your detailed response...'
                            }
                            rows={3}
                            className="w-full p-3 rounded-xl bg-card border border-border text-sm text-foreground focus:ring-1 focus:ring-[#00D3D8] outline-none"
                          />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {evaluationError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-500">{evaluationError}</p>
                  </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    onClick={() => setIsEvaluating(false)}
                    className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/10 transition-colors"
                  >
                    {language === 'es' ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleSubmitEvaluation}
                    disabled={submittingEvaluation}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#00D3D8] to-[#00A5A8] text-white text-sm font-semibold shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
                  >
                    {submittingEvaluation && <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {language === 'es' ? 'Enviar Evaluación' : 'Submit Evaluation'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODO RESULTADO DE EVALUACIÓN COMPLETO */}
          {evaluationComplete && evaluationFeedback && (
            <div className="flex-1 overflow-y-auto px-4 py-8 bg-card/20">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center py-6">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className={`h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      evaluationFeedback.passed ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}
                  >
                    {evaluationFeedback.passed ? (
                      <CheckCircle2 className="w-12 h-12" />
                    ) : (
                      <XCircle className="w-12 h-12" />
                    )}
                  </motion.div>

                  <h2 className="text-2xl font-bold">
                    {evaluationFeedback.passed
                      ? language === 'es'
                        ? '¡Felicidades, Completaste el Módulo!'
                        : 'Congratulations, Module Completed!'
                      : language === 'es'
                        ? 'No se alcanzó el mínimo requerido'
                        : 'Did not meet requirements'}
                  </h2>
                  {currentModule.evaluationEnabled && (
                    <p className="text-sm text-muted mt-1">
                      {language === 'es'
                        ? `Puntuación obtenida: ${evaluationFeedback.score}%. Mínimo requerido: ${evaluationFeedback.passingScore}%`
                        : `Your score: ${evaluationFeedback.score}%. Required minimum: ${evaluationFeedback.passingScore}%`}
                    </p>
                  )}
                </div>

                {/* Detalle de preguntas y feedback (sin correctAnswer y explanation) */}
                {currentModule.evaluationEnabled && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wider pl-1">
                      {language === 'es' ? 'Revisión de Preguntas' : 'Questions Review'}
                    </h3>

                    {(evaluationFeedback.details || []).map((det: EvaluationDetail, idx: number) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border ${
                          det.correct
                            ? 'border-green-500/20 bg-green-500/5'
                            : 'border-red-500/20 bg-red-500/5'
                        }`}
                      >
                        <div className="flex gap-2">
                          {det.correct ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                          )}
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">{det.question}</p>
                            <p className="text-xs">
                              <span className="text-muted">{language === 'es' ? 'Tu respuesta: ' : 'Your answer: '}</span>
                              <strong className={det.correct ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {det.userAnswer}
                              </strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-6 border-t border-border flex justify-center gap-3">
                  {!evaluationFeedback.passed && currentModule.evaluationEnabled && (
                    <button
                      onClick={handleRetryEvaluation}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {language === 'es' ? 'Reintentar Evaluación' : 'Retry Evaluation'}
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/training/center')}
                    className="px-6 py-2.5 rounded-xl bg-[#00D3D8] text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1"
                  >
                    {language === 'es' ? 'Ir al Centro de Capacitación' : 'Go to Training Center'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODO ENSEÑANZA CHAT NORMAL */}
          {!isEvaluating && !evaluationComplete && (
            <>
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-2xl mx-auto space-y-4">
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="max-w-[85%] sm:max-w-[75%]">
                          <div className="p-4 rounded-2xl rounded-bl-sm bg-card border border-border/50 shadow-sm">
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>

                            {/* Mostrar fuentes citadas de RAG si existen */}
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                                <p className="text-[10px] text-muted font-semibold flex items-center gap-1 uppercase tracking-wider">
                                  <BookMarked className="w-3.5 h-3.5 text-[#00D3D8]" />
                                  {language === 'es' ? 'Documentos de referencia:' : 'Sources:'}
                                </p>
                                {msg.citations.map((cite: CitationType, ci: number) => (
                                  <div
                                    key={ci}
                                    className="text-[11px] bg-background/50 border border-border/20 rounded px-2.5 py-1 text-muted"
                                  >
                                    <span className="font-semibold text-foreground">{cite.fileName}</span>: "{cite.snippet}"
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[85%] sm:max-w-[75%]">
                          <div className="p-3 rounded-2xl rounded-br-sm bg-[#00D3D8]/10 text-foreground">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {aiSpeaking && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="p-3 rounded-2xl rounded-bl-sm bg-card border border-border/50 shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#00D3D8] animate-pulse" />
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="w-2 h-2 rounded-full bg-[#00D3D8]"
                                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-center"
                    >
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-500">{error}</span>
                        <button
                          onClick={handleRetryMessage}
                          disabled={!failedMessage || aiSpeaking}
                          className="flex items-center gap-1 ml-2 text-xs text-[#00D3D8] font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          {language === 'es' ? 'Reintentar' : 'Retry'}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Chat Input sticky bar */}
              <div className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t border-border/50 px-4 py-3">
                <div className="max-w-2xl mx-auto flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={aiSpeaking}
                    placeholder={
                      language === 'es' ? 'Haz una pregunta sobre el material...' : 'Ask a question about the material...'
                    }
                    className="flex-1 px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[#00D3D8] disabled:opacity-50 transition-all"
                  />

                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || aiSpeaking}
                    className="w-10 h-10 rounded-xl bg-[#00D3D8] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#00B8BD] transition-colors shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
