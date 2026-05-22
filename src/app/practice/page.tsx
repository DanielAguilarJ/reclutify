'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Zap,
  Clock,
  Target,
  Trophy,
  Brain,
  ArrowRight,
  CheckCircle2,
  Flame,
  BarChart3,
  Lightbulb,
  Mic,
  Star,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import AppNavbar from '@/components/ui/AppNavbar';

export default function PracticePage() {
  const { language } = useAppStore();
  const t = (en: string, es: string) => (language === 'es' ? es : en);
  const [showModal, setShowModal] = useState(false);

  const practiceModes = [
    {
      id: 'quick',
      icon: Zap,
      title: t('Quick Practice', 'Práctica Rápida'),
      description: t(
        'A short session to warm up your interview skills with focused questions.',
        'Una sesión corta para calentar tus habilidades de entrevista con preguntas enfocadas.'
      ),
      questions: 5,
      duration: t('10 min', '10 min'),
      difficulty: t('Beginner', 'Principiante'),
      difficultyColor: 'bg-green-500/10 text-green-600 border-green-500/20',
    },
    {
      id: 'full',
      icon: Target,
      title: t('Full Interview', 'Entrevista Completa'),
      description: t(
        'A comprehensive interview simulation covering multiple competencies and scenarios.',
        'Una simulación de entrevista completa que cubre múltiples competencias y escenarios.'
      ),
      questions: 15,
      duration: t('30 min', '30 min'),
      difficulty: t('Intermediate', 'Intermedio'),
      difficultyColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    {
      id: 'expert',
      icon: Trophy,
      title: t('Expert Challenge', 'Desafío Experto'),
      description: t(
        'An advanced session with complex behavioral and technical questions for experienced professionals.',
        'Una sesión avanzada con preguntas técnicas y conductuales complejas para profesionales experimentados.'
      ),
      questions: 25,
      duration: t('60 min', '60 min'),
      difficulty: t('Advanced', 'Avanzado'),
      difficultyColor: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
  ];

  const tips = [
    {
      icon: Mic,
      text: t(
        'Practice speaking out loud — it helps with real interview confidence.',
        'Practica hablando en voz alta — ayuda con la confianza en entrevistas reales.'
      ),
    },
    {
      icon: Star,
      text: t(
        'Use the STAR method: Situation, Task, Action, Result.',
        'Usa el método STAR: Situación, Tarea, Acción, Resultado.'
      ),
    },
    {
      icon: Clock,
      text: t(
        'Keep answers between 1-2 minutes for optimal engagement.',
        'Mantén las respuestas entre 1-2 minutos para un engagement óptimo.'
      ),
    },
    {
      icon: Brain,
      text: t(
        'Research the company and role before any interview.',
        'Investiga la empresa y el puesto antes de cualquier entrevista.'
      ),
    },
    {
      icon: Lightbulb,
      text: t(
        'Prepare 2-3 questions to ask the interviewer.',
        'Prepara 2-3 preguntas para hacerle al entrevistador.'
      ),
    },
  ];

  const stats = [
    {
      icon: CheckCircle2,
      value: '0',
      label: t('Sessions Completed', 'Sesiones Completadas'),
    },
    {
      icon: BarChart3,
      value: '—',
      label: t('Average Score', 'Puntuación Promedio'),
    },
    {
      icon: Flame,
      value: '0',
      label: t('Day Streak', 'Racha de Días'),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="/practice" />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            {t('AI-Powered', 'Potenciado por IA')}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('Practice AI Interviews', 'Practica Entrevistas con IA')}
          </h1>
          <p className="text-lg text-muted max-w-2xl mx-auto">
            {t(
              'Prepare for your next interview with our AI interviewer. Get real-time feedback, improve your answers, and boost your confidence.',
              'Prepárate para tu próxima entrevista con nuestra entrevistadora de IA. Recibe feedback en tiempo real, mejora tus respuestas y aumenta tu confianza.'
            )}
          </p>
        </section>

        {/* Stats Section */}
        <section className="grid grid-cols-3 gap-4 mb-10">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={i}
                className="bg-card rounded-xl border border-border p-4 text-center"
              >
                <Icon className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted mt-1">{stat.label}</p>
              </div>
            );
          })}
        </section>

        {/* Practice Modes */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-6">
            {t('Choose Your Practice Mode', 'Elige Tu Modo de Práctica')}
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {practiceModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <div
                  key={mode.id}
                  className="bg-card rounded-xl border border-border p-6 flex flex-col hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{mode.title}</h3>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${mode.difficultyColor}`}
                      >
                        {mode.difficulty}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted leading-relaxed mb-4 flex-1">
                    {mode.description}
                  </p>

                  <div className="flex items-center gap-4 mb-5 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Brain className="h-3.5 w-3.5" />
                      {mode.questions} {t('questions', 'preguntas')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {mode.duration}
                    </span>
                  </div>

                  <Link
                    href="/interview/practice"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    {t('Start', 'Comenzar')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* Tips Section */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-6">
            {t('Interview Tips', 'Consejos para Entrevistas')}
          </h2>
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="space-y-4">
              {tips.map((tip, i) => {
                const Icon = tip.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{tip.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-card rounded-xl border border-primary/20 p-8 text-center">
          <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t('Ready for the Real Thing?', '¿Listo para lo Real?')}
          </h2>
          <p className="text-sm text-muted mb-6 max-w-lg mx-auto">
            {t(
              'Our AI interviewer adapts to your role and gives personalized feedback. Start a practice session and see how you perform under pressure.',
              'Nuestra entrevistadora de IA se adapta a tu rol y da feedback personalizado. Inicia una sesión de práctica y ve cómo te desempeñas bajo presión.'
            )}
          </p>
          <Link
            href="/interview/practice"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
          >
            {t('Start Your First Interview', 'Inicia Tu Primera Entrevista')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      {/* Coming Soon Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-card rounded-xl border border-border p-6 max-w-sm w-full shadow-lg">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                {t('Coming Soon!', '¡Próximamente!')}
              </h3>
              <p className="text-sm text-muted mb-6">
                {t(
                  'This practice mode is being prepared. In the meantime, try our free-form AI interview practice.',
                  'Este modo de práctica se está preparando. Mientras tanto, prueba nuestra práctica de entrevista con IA de forma libre.'
                )}
              </p>
              <Link
                href="/interview/practice"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t('Try Free Practice', 'Prueba Práctica Libre')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
