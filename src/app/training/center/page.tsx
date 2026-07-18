'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Lock,
  Play,
  Clock,
  Trophy,
  Star,
  MessageCircle,
  X,
  Send,
  ArrowRight,
  Sparkles,
  GraduationCap,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingStore } from '@/store/trainingStore';

export default function TrainingCenterPage() {
  const router = useRouter();
  const { language } = useAppStore();
  const {
    employee,
    program,
    modules,
    progress,
    phase,
    loading,
    startModule,
    initializeFromSession,
    generalMessages,
    startGeneralChat,
    sendGeneralMessage,
    aiSpeaking,
  } = useTrainingStore();

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const bootstrapAttemptedRef = useRef(false);

  // Recuperar la capacitación desde la cookie HttpOnly al iniciar
  useEffect(() => {
    if (employee || loading || bootstrapAttemptedRef.current) {
      return;
    }

    bootstrapAttemptedRef.current = true;

    initializeFromSession().then((success) => {
      if (!success) {
        router.replace('/');
      }
    });
  }, [
    employee,
    loading,
    initializeFromSession,
    router,
  ]);

  // Cargar mensaje de inicio del tutor general al abrir el chat por primera vez
  useEffect(() => {
    if (showChat && generalMessages.length === 0) {
      void startGeneralChat().catch((error: unknown) => {
        console.error(
          '[Training Center] Could not start general chat:',
          error
        );
      });
    }
  }, [
    showChat,
    generalMessages.length,
    startGeneralChat,
  ]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [generalMessages]);

  if (loading || !employee) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00D3D8] border-t-transparent animate-spin" />
      </div>
    );
  }

  const completedModules = progress.filter((p) => p.status === 'completed').length;
  const totalModules = modules.length;
  const progressPercent = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  const allComplete = phase === 'complete' || employee.status === 'completed';

  // Calculate total time spent
  const totalTimeSpent = progress.reduce((acc, p) => acc + (p.timeSpent || 0), 0);
  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  // Get module status from progress
  const getModuleProgress = (moduleId: string) => {
    return progress.find((p) => p.moduleId === moduleId);
  };

  const handleStartModule = async (moduleId: string) => {
    await startModule(moduleId);
    router.push(`/training/center/module/${moduleId}`);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || aiSpeaking) return;

    const userMsg = chatInput.trim();
    setChatInput('');

    try {
      await sendGeneralMessage(userMsg);
    } catch (error: unknown) {
      setChatInput(userMsg);

      console.error(
        '[Training Center] Could not send general message:',
        error
      );
    }
  };

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">
      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {/* ─── Welcome Header ─── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D3D8] to-[#00A5A8] flex items-center justify-center shadow-md shadow-[#00D3D8]/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#00D3D8] uppercase tracking-wider">
                {language === 'es' ? 'Centro de Capacitación' : 'Training Center'}
              </p>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mt-4">
            {language === 'es'
              ? `Hola ${employee.name.split(' ')[0]}, bienvenido a tu capacitación`
              : `Hi ${employee.name.split(' ')[0]}, welcome to your training`}
          </h1>

          {employee.roleTitle && (
            <p className="text-sm text-muted mt-1">
              {employee.roleTitle}
              {program?.title && ` — ${program.title}`}
            </p>
          )}
        </motion.div>

        {/* ─── Completion Celebration ─── */}
        <AnimatePresence>
          {allComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, type: 'spring' }}
              className="mb-8 relative overflow-hidden"
            >
              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                {/* Confetti-like decorations */}
                <div className="absolute inset-0 pointer-events-none">
                  {[...Array(20)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        background: ['#00D3D8', '#FFD700', '#FF6B6B', '#7C3AED', '#10B981'][i % 5],
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                      }}
                      animate={{
                        y: [0, -20, 0],
                        opacity: [0.3, 1, 0.3],
                        scale: [0.8, 1.2, 0.8],
                      }}
                      transition={{
                        duration: 2 + Math.random() * 2,
                        repeat: Infinity,
                        delay: Math.random() * 2,
                      }}
                    />
                  ))}
                </div>

                <div className="relative z-10 text-center py-6">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                  </motion.div>

                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {language === 'es' ? 'Capacitación Completada!' : 'Training Complete!'}
                  </h2>
                  <p className="text-sm text-muted mb-6">
                    {language === 'es'
                      ? 'Felicidades, has completado todos los módulos exitosamente.'
                      : 'Congratulations, you have successfully completed all modules.'}
                  </p>

                  {/* Certificate card */}
                  <div className="inline-block bg-gradient-to-br from-[#00D3D8]/5 to-[#00A5A8]/10 border border-[#00D3D8]/20 rounded-xl p-6 text-center">
                    <p className="text-xs uppercase tracking-widest text-[#00D3D8] font-medium mb-2">
                      {language === 'es' ? 'Certificado de Completación' : 'Certificate of Completion'}
                    </p>
                    <p className="text-lg font-bold text-foreground">{employee.name}</p>
                    <p className="text-xs text-muted mt-1">{program?.title}</p>
                    {employee.overallScore && (
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00D3D8]/10">
                        <Star className="w-3.5 h-3.5 text-[#00D3D8]" />
                        <span className="text-sm font-semibold text-[#00D3D8]">
                          {employee.overallScore}%
                        </span>
                      </div>
                    )}
                    {employee.completedAt && (
                      <p className="text-xs text-muted mt-2">
                        {new Date(employee.completedAt).toLocaleDateString(
                          language === 'es' ? 'es-MX' : 'en-US',
                          { year: 'numeric', month: 'long', day: 'numeric' }
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Progress Overview Card ─── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm mb-6"
        >
          <div className="flex items-center gap-6">
            {/* Progress Ring */}
            <div className="relative flex-shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120">
                {/* Background ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-border/30"
                  strokeWidth="8"
                />
                {/* Progress ring */}
                <motion.circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 52 * (1 - progressPercent / 100),
                  }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00D3D8" />
                    <stop offset="100%" stopColor="#00A5A8" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{progressPercent}%</span>
                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
                  {language === 'es' ? 'Progreso' : 'Progress'}
                </span>
              </div>
            </div>

            {/* KPI Details */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-semibold">
                  {language === 'es' ? 'Módulos completados' : 'Modules Completed'}
                </p>
                <p className="text-lg font-bold text-foreground">
                  {completedModules} / {totalModules}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">
                    {language === 'es' ? 'Tiempo Invertido' : 'Time Spent'}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatTime(totalTimeSpent)}
                  </p>
                </div>
                {employee.overallScore && (
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">
                      {language === 'es' ? 'Calificación Promedio' : 'Average Grade'}
                    </p>
                    <p className="text-sm font-semibold text-success">
                      {employee.overallScore}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Modules List ─── */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground mb-3">
            {language === 'es' ? 'Tu Plan de Aprendizaje' : 'Your Learning Plan'}
          </h2>
          {[...modules]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((module, index) => {
              const modProgress = getModuleProgress(module.id);
              const isLocked = !modProgress || modProgress.status === 'locked';
              const isAvailable = modProgress?.status === 'available';
              const isInProgress = modProgress?.status === 'in_progress';
              const isCompleted = modProgress?.status === 'completed';

              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + index * 0.08 }}
                  className={`p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex items-center gap-4 transition-all ${
                    isLocked ? 'opacity-60' : 'hover:shadow-md cursor-pointer'
                  }`}
                  onClick={() => {
                    if (isAvailable || isInProgress) handleStartModule(module.id);
                    if (isCompleted) router.push(`/training/center/module/${module.id}`);
                  }}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {isLocked && (
                      <div className="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-muted" />
                      </div>
                    )}
                    {isAvailable && (
                      <div className="relative w-10 h-10 rounded-full bg-[#00D3D8]/10 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-[#00D3D8]/20 animate-ping" />
                        <Play className="w-4 h-4 text-[#00D3D8]" />
                      </div>
                    )}
                    {isInProgress && (
                      <div className="w-10 h-10 rounded-full bg-[#00D3D8]/10 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full border-2 border-[#00D3D8] border-t-transparent animate-spin" />
                      </div>
                    )}
                    {isCompleted && (
                      <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      </div>
                    )}
                  </div>

                  {/* Module Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {language === 'es' ? `Módulo ${index + 1}: ` : `Module ${index + 1}: `}
                      {module.title}
                    </p>
                    {module.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-1">
                        {module.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {module.durationEstimate} min
                      </span>
                      {modProgress?.timeSpent ? (
                        <span className="text-xs text-muted">
                          {formatTime(modProgress.timeSpent)}{' '}
                          {language === 'es' ? 'invertidos' : 'spent'}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Right side: Score or action */}
                  <div className="flex-shrink-0">
                    {isCompleted && modProgress?.score != null && (
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 rounded-full bg-green-500/10 text-xs font-semibold text-green-600">
                          {modProgress.score}%
                        </div>
                        <RotateCcw className="w-3.5 h-3.5 text-muted" />
                      </div>
                    )}
                    {isAvailable && (
                      <div className="flex items-center gap-1 text-[#00D3D8]">
                        <span className="text-xs font-medium">
                          {language === 'es' ? 'Comenzar' : 'Start'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {isInProgress && (
                      <div className="flex items-center gap-1 text-[#00D3D8]">
                        <span className="text-xs font-medium">
                          {language === 'es' ? 'Continuar' : 'Continue'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {isCompleted && !modProgress?.score && (
                      <span className="text-xs font-medium text-muted">
                        {language === 'es' ? 'Revisar' : 'Review'}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>

      {/* ─── AI Assistant Floating Button ─── */}
      <AnimatePresence>
        {!showChat && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 300 }}
            onClick={() => setShowChat(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-[#00D3D8] to-[#00A5A8] text-white shadow-lg shadow-[#00D3D8]/30 flex items-center justify-center hover:shadow-[#00D3D8]/50 transition-shadow z-50"
          >
            <MessageCircle className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── AI Chat Drawer ─── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-3rem)] h-[480px] bg-card border border-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50"
          >
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-[#00D3D8]/5 to-transparent">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00D3D8]" />
                <span className="text-sm font-semibold text-foreground">
                  {language === 'es' ? 'Asistente IA' : 'AI Assistant'}
                </span>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-full hover:bg-muted/10 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {generalMessages.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="w-8 h-8 text-[#00D3D8]/40 mx-auto mb-3" />
                  <p className="text-xs text-muted">
                    {language === 'es'
                      ? 'Pregunta lo que necesites sobre tu capacitación'
                      : 'Ask anything you need about your training'}
                  </p>
                </div>
              )}
              {generalMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-[#00D3D8]/10 text-foreground rounded-br-sm'
                        : 'bg-card border border-border/50 text-foreground rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiSpeaking && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border/50 px-3 py-2 rounded-xl rounded-bl-sm">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-[#00D3D8]"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-border/50">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder={
                    language === 'es'
                      ? 'Escribe tu pregunta...'
                      : 'Type your question...'
                  }
                  className="flex-1 px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[#00D3D8]/30"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || aiSpeaking}
                  className="w-9 h-9 rounded-xl bg-[#00D3D8] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#00B8BD] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
