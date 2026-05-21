'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles,
  Play,
  Loader2,
  ArrowRight,
  Mic,
  MicOff,
  RotateCcw,
  Award,
  ThumbsUp,
  ThumbsDown,
  Building2,
  Globe,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAppStore } from '@/store/appStore';
import { usePracticeStore } from '@/store/practiceStore';
import { dictionaries } from '@/lib/i18n';
import ScoreGauge from '@/components/admin/ScoreGauge';
import TopicScoreBar from '@/components/admin/TopicScoreBar';

export default function PracticePage() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const {
    phase,
    roleTitle,
    roleDescription,
    topics,
    currentTopicIndex,
    transcript,
    evaluation,
    setPhase,
    setRoleTitle,
    setRoleDescription,
    setTopics,
    addTranscriptEntry,
    nextTopic,
    setEvaluation,
    reset,
  } = usePracticeStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speakingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  // Setup form submit — generate rubric
  const handleGenerateTopics = async () => {
    if (!roleTitle.trim()) return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/generate-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleTitle,
          roleDescription,
          language,
        }),
      });

      const data = await res.json();
      if (data.topics && data.topics.length > 0) {
        const formattedTopics = data.topics.map(
          (t: { label: string; rubric?: object }, i: number) => ({
            ...t,
            status: i === 0 ? 'current' : 'pending',
          })
        );
        setTopics(formattedTopics);
        setPhase('interview');
      }
    } catch (err) {
      console.error('Generate rubric error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // TTS
  const speakText = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (!window.speechSynthesis) {
          resolve();
          return;
        }
        speakingRef.current = true;
        setIsSpeaking(true);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === 'es' ? 'es-MX' : 'en-US';
        utterance.rate = 1;
        utterance.pitch = 1.1;
        utterance.onend = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          resolve();
        };
        utterance.onerror = () => {
          speakingRef.current = false;
          setIsSpeaking(false);
          resolve();
        };

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    },
    [language]
  );

  // Start interview
  const startInterview = async () => {
    setHasStarted(true);
    const greeting =
      language === 'es'
        ? `¡Hola! Soy Zara, tu entrevistadora de IA. Vamos a practicar una entrevista para el puesto de ${roleTitle}. Empecemos con el primer tema: ${topics[0]?.label}. ¿Estás listo?`
        : `Hi! I'm Zara, your AI interviewer. Let's practice an interview for the ${roleTitle} position. Let's start with the first topic: ${topics[0]?.label}. Are you ready?`;

    addTranscriptEntry({ role: 'assistant', content: greeting, timestamp: Date.now() });
    await speakText(greeting);
    startListening();
  };

  // STT
  const startListening = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language === 'es' ? 'es-MX' : 'en-US';

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      if (lastResult.isFinal) {
        const userText = lastResult[0].transcript.trim();
        if (userText) {
          recognition.stop();
          setIsListening(false);
          addTranscriptEntry({ role: 'user', content: userText, timestamp: Date.now() });
          await handleChat(userText);
        }
      }
    };

    recognition.onend = () => {
      if (!speakingRef.current && !isProcessing && phase === 'interview') {
        try {
          recognition.start();
        } catch {
          // Ignore restart errors
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // Chat handler
  const handleChat = async (userText: string) => {
    setIsProcessing(true);
    try {
      const currentTopic = topics[currentTopicIndex]?.label || '';
      const isLastTopic = currentTopicIndex >= topics.length - 1;

      const recentMessages = [...transcript.slice(-8), { role: 'user', content: userText }].map(
        (m) => ({ role: m.role, content: m.content })
      );

      const allTopicsFormatted = topics.map((t) => ({
        label: t.label,
        status: t.status,
        rubric: t.rubric,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTopic,
          allTopics: allTopicsFormatted,
          recentMessages,
          language,
          roleTitle,
          roleDescription,
          isLastTopic,
        }),
      });

      const data = await res.json();
      if (data.message) {
        let aiMessage = data.message;
        let advanceTopic = false;
        let finishInterview = false;

        if (aiMessage.includes('[END_INTERVIEW]')) {
          finishInterview = true;
          aiMessage = aiMessage.replace(/\[END_INTERVIEW\]/g, '').trim();
        } else if (aiMessage.includes('[NEXT_TOPIC]')) {
          advanceTopic = true;
          aiMessage = aiMessage.replace(/\[NEXT_TOPIC\]/g, '').trim();
        }

        if (aiMessage) {
          addTranscriptEntry({ role: 'assistant', content: aiMessage, timestamp: Date.now() });
          await speakText(aiMessage);
        }

        if (finishInterview) {
          stopListening();
          await handleEvaluate();
        } else if (advanceTopic) {
          if (isLastTopic) {
            stopListening();
            await handleEvaluate();
          } else {
            nextTopic();
            startListening();
          }
        } else {
          startListening();
        }
      }
    } catch (err) {
      console.error('Practice chat error:', err);
      startListening();
    } finally {
      setIsProcessing(false);
    }
  };

  // Evaluate
  const handleEvaluate = async () => {
    setPhase('evaluating');
    setIsEvaluating(true);

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: usePracticeStore.getState().transcript,
          topics,
          candidateName: language === 'es' ? 'Practicante' : 'Practitioner',
          language,
          roleTitle,
          roleDescription,
        }),
      });

      const data = await res.json();
      const evalData = data.evaluation || data;
      setEvaluation(evalData);
      setPhase('results');
    } catch (err) {
      console.error('Practice evaluation error:', err);
      setPhase('results');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleReset = () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    reset();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[#10b981]';
    if (score >= 60) return 'text-[#f59e0b]';
    return 'text-[#ef4444]';
  };

  return (
    <div className="min-h-screen bg-[#1a1b23] text-white flex flex-col font-sans selection:bg-[#D3FB52] selection:text-black">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#1a1b23]/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <Link
            href="/login"
            className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm border border-white/20 hover:border-white/40 transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {/* Setup Phase */}
          {phase === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-xl"
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D3FB52]/10 border border-[#D3FB52]/20 text-[#D3FB52] text-xs font-semibold uppercase tracking-wider mb-4">
                  <Sparkles className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Gratis para siempre' : 'Free forever'}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                  {t.practiceTitle}
                </h1>
                <p className="text-neutral-400 text-lg">
                  {t.practiceSub}
                </p>
              </div>

              <div className="bg-white/5 rounded-3xl border border-white/10 p-8 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    {t.practiceRoleTitle}
                  </label>
                  <input
                    type="text"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder={language === 'es' ? 'Ej: Frontend Developer, Marketing Manager...' : 'E.g. Frontend Developer, Marketing Manager...'}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30 placeholder:text-neutral-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    {t.practiceRoleDesc}
                  </label>
                  <textarea
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder={language === 'es' ? 'Describe las responsabilidades y requisitos del puesto...' : 'Describe the responsibilities and requirements...'}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30 placeholder:text-neutral-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleGenerateTopics}
                  disabled={!roleTitle.trim() || isGenerating}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#D3FB52] text-black font-semibold hover:bg-[#c1e847] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t.practiceGenerating}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      {t.practiceStart}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Interview Phase */}
          {phase === 'interview' && (
            <motion.div
              key="interview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-3xl h-[70vh] flex flex-col"
            >
              {/* Topic bar */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                {topics.map((topic, i) => (
                  <div
                    key={i}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      topic.status === 'current'
                        ? 'bg-[#D3FB52]/20 border-[#D3FB52]/30 text-[#D3FB52]'
                        : topic.status === 'completed'
                        ? 'bg-white/5 border-white/10 text-neutral-400'
                        : 'bg-transparent border-white/5 text-neutral-600'
                    }`}
                  >
                    {topic.status === 'completed' ? '✓ ' : ''}{topic.label}
                  </div>
                ))}
              </div>

              {/* Chat area */}
              <div
                ref={scrollRef}
                className="flex-1 bg-[#0e0f14] rounded-3xl border border-white/10 overflow-y-auto p-6 space-y-4"
              >
                {!hasStarted ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <Sparkles className="h-12 w-12 text-[#D3FB52]/30 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">
                      {language === 'es' ? '¿Listo para practicar?' : 'Ready to practice?'}
                    </h3>
                    <p className="text-sm text-neutral-400 mb-6 max-w-sm">
                      {language === 'es'
                        ? 'Zara te hará preguntas sobre cada tema. Responde con voz — como una entrevista real.'
                        : "Zara will ask you questions about each topic. Answer with your voice — just like a real interview."}
                    </p>
                    <button
                      onClick={startInterview}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D3FB52] text-black font-semibold hover:bg-[#c1e847] transition-colors cursor-pointer"
                    >
                      <Mic className="h-4 w-4" />
                      {language === 'es' ? 'Comenzar Entrevista' : 'Start Interview'}
                    </button>
                  </div>
                ) : (
                  transcript.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          entry.role === 'assistant' ? 'bg-[#D3FB52]/20' : 'bg-[#00D3D8]/20'
                        }`}
                      >
                        {entry.role === 'assistant' ? (
                          <Sparkles className="w-3.5 h-3.5 text-[#D3FB52]" />
                        ) : (
                          <span className="text-xs font-medium text-[#00D3D8]">U</span>
                        )}
                      </div>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          entry.role === 'assistant'
                            ? 'bg-white/5 rounded-tl-sm text-neutral-300'
                            : 'bg-[#00D3D8]/10 rounded-tr-sm text-neutral-300'
                        }`}
                      >
                        {entry.content}
                      </div>
                    </div>
                  ))
                )}

                {isProcessing && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#D3FB52]/20 flex items-center justify-center shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-[#D3FB52]" />
                    </div>
                    <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mic controls */}
              {hasStarted && (
                <div className="flex items-center justify-center gap-4 mt-4">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${
                    isSpeaking
                      ? 'bg-[#D3FB52]/10 text-[#D3FB52] border border-[#D3FB52]/20'
                      : isListening
                      ? 'bg-[#00D3D8]/10 text-[#00D3D8] border border-[#00D3D8]/20'
                      : isProcessing
                      ? 'bg-white/5 text-neutral-400 border border-white/10'
                      : 'bg-white/5 text-neutral-500 border border-white/10'
                  }`}>
                    {isSpeaking ? (
                      <><Sparkles className="h-3 w-3 animate-pulse" /> {language === 'es' ? 'Zara hablando...' : 'Zara speaking...'}</>
                    ) : isListening ? (
                      <><Mic className="h-3 w-3 animate-pulse" /> {language === 'es' ? 'Escuchándote...' : 'Listening...'}</>
                    ) : isProcessing ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> {language === 'es' ? 'Procesando...' : 'Processing...'}</>
                    ) : (
                      <><MicOff className="h-3 w-3" /> {language === 'es' ? 'Micrófono apagado' : 'Mic off'}</>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Evaluating Phase */}
          {phase === 'evaluating' && (
            <motion.div
              key="evaluating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[#D3FB52]/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#D3FB52] animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {language === 'es' ? 'Evaluando tu entrevista...' : 'Evaluating your interview...'}
                </h2>
                <p className="text-sm text-neutral-400">
                  {language === 'es' ? 'Zara está analizando tus respuestas' : 'Zara is analyzing your responses'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Results Phase */}
          {phase === 'results' && evaluation && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl pb-12"
            >
              <div className="text-center mb-8">
                <Award className="h-10 w-10 text-[#D3FB52] mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">{t.practiceResultsTitle}</h1>
                <p className="text-neutral-400">{t.practiceResultsSub}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score + Recommendation */}
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col items-center">
                    <ScoreGauge score={evaluation.overallScore} />
                    <span className={`mt-4 px-4 py-1.5 rounded-full text-sm font-medium border ${
                      evaluation.recommendation === 'Strong Hire'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : evaluation.recommendation === 'Hire'
                        ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {evaluation.recommendation}
                    </span>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t.practiceAgain}
                  </button>
                </div>

                {/* Main content */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Executive Summary */}
                  {evaluation.executiveSummary && (
                    <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                      <h3 className="text-sm font-medium text-neutral-300 mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[#D3FB52]" />
                        {language === 'es' ? 'Resumen de tu Desempeño' : 'Performance Summary'}
                      </h3>
                      <p className="text-sm text-neutral-400 leading-relaxed">{evaluation.executiveSummary}</p>
                    </div>
                  )}

                  {/* Pros & Cons */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <ThumbsUp className="h-4 w-4 text-emerald-400" />
                        <h3 className="text-sm font-medium text-neutral-300">
                          {language === 'es' ? 'Fortalezas' : 'Strengths'}
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {evaluation.pros.map((pro, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-neutral-400 leading-relaxed">
                            <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                            {pro}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <ThumbsDown className="h-4 w-4 text-red-400" />
                        <h3 className="text-sm font-medium text-neutral-300">
                          {language === 'es' ? 'Áreas de Mejora' : 'Areas to Improve'}
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {evaluation.cons.map((con, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-neutral-400 leading-relaxed">
                            <span className="text-red-400 mt-0.5 shrink-0">•</span>
                            {con}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Topic Scores */}
                  <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                    <h3 className="text-sm font-medium text-neutral-300 mb-4">
                      {language === 'es' ? 'Puntuación por Tema' : 'Topic Scores'}
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(evaluation.topicScores).map(([topic, score]) => (
                        <TopicScoreBar key={topic} topic={topic} score={score} />
                      ))}
                    </div>
                  </div>

                  {/* B2B CTA */}
                  <div className="relative overflow-hidden rounded-2xl border border-[#D3FB52]/20 bg-gradient-to-r from-[#D3FB52]/5 to-[#00D3D8]/5 p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="h-4 w-4 text-[#D3FB52]" />
                          <span className="text-xs font-bold uppercase tracking-wider text-[#D3FB52]">
                            {language === 'es' ? 'Para Empresas' : 'For Companies'}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">{t.practiceCta}</h3>
                        <p className="text-sm text-neutral-400">{t.practiceCtaSub}</p>
                      </div>
                      <Link
                        href="/login"
                        className="shrink-0 inline-flex items-center gap-2 bg-[#D3FB52] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#c1e847] transition-colors"
                      >
                        {language === 'es' ? 'Comenzar Gratis' : 'Start Free'}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
