'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Mic,
  CheckCircle2,
  RefreshCw,
  Clock,
  BookOpen,
  Sparkles,
  Award,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingStore } from '@/store/trainingStore';
import type { TrainingMessage } from '@/types';

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
    messages,
    currentSession,
    aiSpeaking,
    addMessage,
    setAiSpeaking,
    startModule,
    completeModule,
    saveSession,
  } = useTrainingStore();

  const [input, setInput] = useState('');
  const [isEvaluationReady, setIsEvaluationReady] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);

  const currentModule = modules.find((m) => m.id === moduleId);
  const moduleProgress = progress.find((p) => p.moduleId === moduleId);
  const isCompleted = moduleProgress?.status === 'completed';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize module
  useEffect(() => {
    if (!employee || initialized) return;

    const init = async () => {
      // If module is not already in_progress, start it
      if (moduleProgress?.status === 'available' || moduleProgress?.status === 'locked') {
        await startModule(moduleId);
      }

      // If there are existing messages (resumed session), don't send initial
      if (messages.length > 0) {
        setInitialized(true);
        return;
      }

      // Send initial message to get AI's opening
      setAiSpeaking(true);
      try {
        const res = await fetch('/api/training/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: employee.id,
            moduleId,
            sessionType: 'module',
            messages: [],
            isInitial: true,
          }),
        });

        if (!res.ok) throw new Error('Failed to initialize');

        const data = await res.json();
        const aiMessage: TrainingMessage = {
          role: 'assistant',
          content: data.message || (language === 'es' ? 'Bienvenido a este módulo. ¿Estás listo para comenzar?' : 'Welcome to this module. Are you ready to start?'),
          timestamp: Date.now(),
          type: data.type || 'text',
        };
        addMessage(aiMessage);
      } catch {
        addMessage({
          role: 'assistant',
          content: language === 'es'
            ? 'Hola, soy tu tutor de IA. Vamos a comenzar con este módulo. ¿Tienes alguna pregunta antes de empezar?'
            : "Hi, I'm your AI tutor. Let's get started with this module. Do you have any questions before we begin?",
          timestamp: Date.now(),
          type: 'text',
        });
      } finally {
        setAiSpeaking(false);
        setInitialized(true);
      }
    };

    init();
  }, [employee, moduleId, initialized, messages.length, moduleProgress?.status, startModule, addMessage, setAiSpeaking, language]);

  // Auto-save every 30 seconds
  useEffect(() => {
    saveIntervalRef.current = setInterval(() => {
      saveSession();
    }, 30000);

    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      // Save on unmount
      saveSession();
    };
  }, [saveSession]);

  // Elapsed timer
  useEffect(() => {
    elapsedRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 60000); // Every minute

    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  // Send message handler
  const handleSend = useCallback(async () => {
    if (!input.trim() || aiSpeaking || !employee) return;

    const userMessage: TrainingMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
      type: 'text',
    };

    setInput('');
    addMessage(userMessage);
    setAiSpeaking(true);
    setError(null);

    try {
      const allMessages = [...messages, userMessage];

      const res = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          moduleId,
          sessionType: isEvaluating ? 'evaluation' : 'module',
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          isEvaluating,
        }),
      });

      if (!res.ok) throw new Error('Failed to get response');

      const data = await res.json();

      const aiMessage: TrainingMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
        type: data.type || 'text',
      };
      addMessage(aiMessage);

      // Check for flags from AI
      if (data.contentCovered && !isEvaluating) {
        setIsEvaluationReady(true);
      }

      if (data.evaluationComplete) {
        const score = data.score ?? 85;
        setFinalScore(score);
        setEvaluationComplete(true);
        await completeModule(moduleId, score);
      }
    } catch {
      setError(
        language === 'es'
          ? 'Error al obtener respuesta. Intenta de nuevo.'
          : 'Failed to get response. Please try again.'
      );
    } finally {
      setAiSpeaking(false);
    }
  }, [input, aiSpeaking, employee, messages, moduleId, isEvaluating, addMessage, setAiSpeaking, completeModule, language]);

  // Start evaluation
  const handleStartEvaluation = async () => {
    setIsEvaluating(true);
    setIsEvaluationReady(false);
    setAiSpeaking(true);

    try {
      const res = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee?.id,
          moduleId,
          sessionType: 'evaluation',
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          startEvaluation: true,
        }),
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      addMessage({
        role: 'assistant',
        content: data.message || (language === 'es' ? 'Vamos a evaluar lo que has aprendido. Te haré algunas preguntas.' : "Let's evaluate what you've learned. I'll ask you some questions."),
        timestamp: Date.now(),
        type: data.type || 'text',
      });
    } catch {
      addMessage({
        role: 'assistant',
        content: language === 'es'
          ? 'Vamos a evaluar tu comprensión. Responde las siguientes preguntas.'
          : "Let's evaluate your understanding. Answer the following questions.",
        timestamp: Date.now(),
        type: 'text',
      });
    } finally {
      setAiSpeaking(false);
    }
  };

  // Handle quiz option click
  const handleQuizOption = (option: string) => {
    setInput(option);
    // Auto-send after short delay for UX
    setTimeout(() => {
      const userMessage: TrainingMessage = {
        role: 'user',
        content: option,
        timestamp: Date.now(),
        type: 'text',
      };
      addMessage(userMessage);
      setInput('');
      // Trigger AI response
      setAiSpeaking(true);
      fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee?.id,
          moduleId,
          sessionType: isEvaluating ? 'evaluation' : 'module',
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          isEvaluating,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          addMessage({
            role: 'assistant',
            content: data.message,
            timestamp: Date.now(),
            type: data.type || 'feedback',
          });
          if (data.evaluationComplete) {
            const score = data.score ?? 85;
            setFinalScore(score);
            setEvaluationComplete(true);
            completeModule(moduleId, score);
          }
        })
        .catch(() => {
          setError(language === 'es' ? 'Error de conexión' : 'Connection error');
        })
        .finally(() => setAiSpeaking(false));
    }, 100);
  };

  // Retry on error
  const handleRetry = () => {
    setError(null);
    if (messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        setInput(lastUserMsg.content);
      }
    }
  };

  // Parse quiz from message content (expects JSON-like structure)
  const parseQuiz = (content: string) => {
    try {
      // Check if content has quiz markers
      const match = content.match(/\[QUIZ\]([\s\S]*?)\[\/QUIZ\]/);
      if (match) {
        const quizData = JSON.parse(match[1]);
        return quizData as { question: string; options: string[] };
      }
    } catch {
      // Not a quiz format
    }
    return null;
  };

  if (!employee || !currentModule) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00D3D8] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Sections covered (based on message count heuristic)
  const totalSections = currentModule.content?.sections?.length || 0;
  const coveredSections = Math.min(
    totalSections,
    Math.floor(messages.filter((m) => m.role === 'assistant').length / 2)
  );

  return (
    <div className="h-screen bg-background flex flex-col animate-in fade-in duration-500">
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
                saveSession();
                router.push('/training/center');
              }}
              className="w-8 h-8 rounded-lg hover:bg-muted/10 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">
                {currentModule.title}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {totalSections > 0 && (
                  <span className="text-xs text-muted">
                    {coveredSections}/{totalSections}{' '}
                    {language === 'es' ? 'secciones' : 'sections'}
                  </span>
                )}
                {elapsed > 0 && (
                  <span className="text-xs text-muted flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {elapsed}min
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEvaluationReady && !isEvaluating && !evaluationComplete && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleStartEvaluation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00D3D8] to-[#00A5A8] text-white text-xs font-medium shadow-sm"
              >
                <Award className="w-3.5 h-3.5" />
                {language === 'es' ? 'Ir a Evaluación' : 'Start Evaluation'}
              </motion.button>
            )}
            {isEvaluating && !evaluationComplete && (
              <span className="px-2.5 py-1 rounded-full bg-[#00D3D8]/10 text-xs font-medium text-[#00D3D8]">
                {language === 'es' ? 'Evaluación' : 'Evaluation'}
              </span>
            )}
          </div>
        </div>
      </motion.header>

      {/* ─── Main Content (Desktop: sidebar + chat) ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-border/50 bg-card/50 overflow-y-auto p-5">
          <div className="space-y-5">
            {/* Module info */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-1">
                {currentModule.title}
              </h2>
              {currentModule.description && (
                <p className="text-xs text-muted leading-relaxed">
                  {currentModule.description}
                </p>
              )}
            </div>

            {/* Sections list */}
            {currentModule.content?.sections && currentModule.content.sections.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Secciones' : 'Sections'}
                </h3>
                <div className="space-y-1.5">
                  {currentModule.content.sections.map((section, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 py-1.5"
                    >
                      {i < coveredSections ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-border/50 mt-0.5 flex-shrink-0" />
                      )}
                      <span className={`text-xs ${i < coveredSections ? 'text-foreground' : 'text-muted'}`}>
                        {section.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key points */}
            {currentModule.content?.sections && coveredSections > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  {language === 'es' ? 'Puntos Clave' : 'Key Points'}
                </h3>
                <div className="space-y-1">
                  {currentModule.content.sections
                    .slice(0, coveredSections)
                    .flatMap((s) => s.keyPoints || [])
                    .slice(0, 6)
                    .map((point, i) => (
                      <p key={i} className="text-xs text-muted flex items-start gap-1.5">
                        <span className="text-[#00D3D8] mt-0.5">•</span>
                        {point}
                      </p>
                    ))}
                </div>
              </div>
            )}

            {/* Time & Score */}
            <div className="pt-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">
                  {language === 'es' ? 'Tiempo' : 'Time'}
                </span>
                <span className="text-foreground font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {elapsed > 0 ? `${elapsed} min` : '0 min'}
                </span>
              </div>
              {finalScore !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">
                    {language === 'es' ? 'Puntuación' : 'Score'}
                  </span>
                  <span className="text-green-500 font-semibold">{finalScore}%</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ─── Chat Area ─── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg, i) => {
                const quiz = msg.type === 'quiz' ? parseQuiz(msg.content) : null;
                const isCelebration = msg.type === 'celebration';
                const isFeedback = msg.type === 'feedback';
                const isCorrectFeedback = isFeedback && (msg.content.toLowerCase().includes('correcto') || msg.content.toLowerCase().includes('correct'));

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="max-w-[85%] sm:max-w-[75%]">
                        {/* Celebration message */}
                        {isCelebration ? (
                          <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="p-4 rounded-2xl rounded-bl-sm bg-gradient-to-br from-[#00D3D8]/10 to-green-500/10 border border-[#00D3D8]/20"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <motion.div
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              >
                                <Award className="w-5 h-5 text-[#00D3D8]" />
                              </motion.div>
                              <span className="text-sm font-semibold text-foreground">
                                {language === 'es' ? 'Excelente!' : 'Excellent!'}
                              </span>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </motion.div>
                        ) : isFeedback ? (
                          <div
                            className={`p-3 rounded-2xl rounded-bl-sm border-l-4 ${
                              isCorrectFeedback
                                ? 'border-l-green-500 bg-green-500/5'
                                : 'border-l-red-400 bg-red-400/5'
                            }`}
                          >
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        ) : quiz ? (
                          <div className="p-4 rounded-2xl rounded-bl-sm bg-card border border-border/50 shadow-sm">
                            <p className="text-sm font-medium text-foreground mb-3">
                              {quiz.question}
                            </p>
                            <div className="space-y-2">
                              {quiz.options.map((opt: string, oi: number) => (
                                <button
                                  key={oi}
                                  onClick={() => handleQuizOption(opt)}
                                  className="w-full text-left px-3 py-2 rounded-xl border border-border/50 text-sm text-foreground hover:bg-[#00D3D8]/5 hover:border-[#00D3D8]/30 transition-colors"
                                >
                                  <span className="font-medium text-[#00D3D8] mr-2">
                                    {String.fromCharCode(65 + oi)}.
                                  </span>
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-2xl rounded-bl-sm bg-card border border-border/50 shadow-sm">
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[85%] sm:max-w-[75%]">
                        <div className="p-3 rounded-2xl rounded-br-sm bg-[#00D3D8]/10">
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Typing indicator */}
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

              {/* Error message */}
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
                      onClick={handleRetry}
                      className="flex items-center gap-1 ml-2 text-xs text-[#00D3D8] font-medium hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {language === 'es' ? 'Reintentar' : 'Retry'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Evaluation complete celebration */}
              <AnimatePresence>
                {evaluationComplete && finalScore !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="flex justify-center py-4"
                  >
                    <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm text-center max-w-sm">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Award className="w-12 h-12 text-[#00D3D8] mx-auto mb-3" />
                      </motion.div>
                      <h3 className="text-lg font-bold text-foreground mb-1">
                        {language === 'es' ? 'Módulo Completado!' : 'Module Complete!'}
                      </h3>
                      <p className="text-sm text-muted mb-3">
                        {language === 'es'
                          ? 'Has aprobado la evaluación exitosamente.'
                          : 'You have successfully passed the evaluation.'}
                      </p>
                      <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00D3D8]/10">
                        <span className="text-xl font-bold text-[#00D3D8]">{finalScore}%</span>
                      </div>
                      <div className="mt-4 flex gap-2 justify-center">
                        <button
                          onClick={() => router.push('/training/center')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#00D3D8] to-[#00A5A8] text-white text-sm font-medium shadow-sm"
                        >
                          {language === 'es' ? 'Volver al Centro' : 'Back to Center'}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ─── Input Area ─── */}
          <div className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t border-border/50 px-4 py-3">
            <div className="max-w-2xl mx-auto">
              {/* Evaluation ready banner */}
              {isEvaluationReady && !isEvaluating && !evaluationComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center justify-between p-3 rounded-xl bg-[#00D3D8]/5 border border-[#00D3D8]/20"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#00D3D8]" />
                    <span className="text-xs text-foreground">
                      {language === 'es'
                        ? 'Contenido cubierto. ¿Listo para la evaluación?'
                        : 'Content covered. Ready for evaluation?'}
                    </span>
                  </div>
                  <button
                    onClick={handleStartEvaluation}
                    className="px-3 py-1 rounded-lg bg-[#00D3D8] text-white text-xs font-medium"
                  >
                    {language === 'es' ? 'Comenzar' : 'Start'}
                  </button>
                </motion.div>
              )}

              <div className="flex items-center gap-2">
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
                  disabled={aiSpeaking || evaluationComplete}
                  placeholder={
                    evaluationComplete
                      ? language === 'es' ? 'Evaluación completada' : 'Evaluation complete'
                      : isEvaluating
                        ? language === 'es' ? 'Escribe tu respuesta...' : 'Type your answer...'
                        : language === 'es' ? 'Escribe tu mensaje...' : 'Type your message...'
                  }
                  className="flex-1 px-4 py-3 rounded-xl bg-card border border-border/50 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[#00D3D8]/30 disabled:opacity-50 transition-all"
                />

                {/* Microphone button (placeholder for future TTS) */}
                <button
                  disabled
                  className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted opacity-40"
                  title={language === 'es' ? 'Próximamente' : 'Coming soon'}
                >
                  <Mic className="w-4 h-4" />
                </button>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || aiSpeaking || evaluationComplete}
                  className="w-10 h-10 rounded-xl bg-[#00D3D8] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#00B8BD] transition-colors shadow-sm shadow-[#00D3D8]/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
