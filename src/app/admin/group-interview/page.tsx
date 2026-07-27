'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import { Users, Play, ChevronRight, RotateCcw, CheckCircle2, Loader2, ClipboardList, Sparkles } from 'lucide-react';

// ─── Types ───
interface RoleOption {
  id: string;
  title: string;
  topics: { id: string; label: string }[];
}

type SessionState = 'select-role' | 'configure' | 'loading' | 'active' | 'finished';

export default function GroupInterviewPage() {
  const { language } = useAppStore();
  const t = language === 'es' ? es : en;

  // ─── State ───
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [sessionState, setSessionState] = useState<SessionState>('select-role');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [roleTitle, setRoleTitle] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loadingRoles, setLoadingRoles] = useState(true);

  // ─── Fetch roles on mount ───
  useEffect(() => {
    async function fetchRoles() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.org_id) return;

        const { data: rolesData } = await supabase
          .from('roles')
          .select('id, title, topics')
          .eq('org_id', profile.org_id)
          .order('created_at', { ascending: false });

        if (rolesData) {
          setRoles(rolesData.map(r => ({
            id: r.id,
            title: r.title,
            topics: Array.isArray(r.topics) ? r.topics : [],
          })));
        }
      } catch {
        setError(t.errorLoadingRoles);
      } finally {
        setLoadingRoles(false);
      }
    }
    fetchRoles();
  }, [t.errorLoadingRoles]);

  // ─── Generate questions (single AI call) ───
  const startSession = useCallback(async () => {
    if (!selectedRoleId) return;
    setSessionState('loading');
    setError('');

    try {
      const res = await fetch('/api/group-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: selectedRoleId,
          language,
          questionCount,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate questions');
      }

      const data = await res.json();
      setQuestions(data.questions);
      setRoleTitle(data.roleTitle);
      setCurrentIndex(0);
      setSessionState('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGenerating);
      setSessionState('configure');
    }
  }, [selectedRoleId, language, questionCount, t.errorGenerating]);

  // ─── Navigation ───
  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSessionState('finished');
    }
  };

  const resetSession = () => {
    setQuestions([]);
    setCurrentIndex(0);
    setSessionState('select-role');
    setSelectedRoleId('');
    setError('');
  };

  // ─── RENDER ───

  // Loading roles
  if (loadingRoles) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Step 1: Select Role
  if (sessionState === 'select-role') {
    return (
      <div className="max-w-2xl mx-auto">
        <Header t={t} />

        {roles.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
            <ClipboardList className="h-12 w-12 text-muted mx-auto mb-4" />
            <p className="text-foreground font-medium">{t.noRoles}</p>
            <p className="text-muted text-sm mt-2">{t.noRolesHint}</p>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-4">
            <label className="block text-sm font-medium text-foreground">{t.selectRole}</label>
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">{t.selectPlaceholder}</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>
                  {role.title} ({role.topics.length} {t.topics})
                </option>
              ))}
            </select>

            {selectedRoleId && (
              <button
                onClick={() => setSessionState('configure')}
                className="w-full mt-4 px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
              >
                {t.continue}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Step 2: Configure
  if (sessionState === 'configure') {
    const selectedRole = roles.find(r => r.id === selectedRoleId);
    return (
      <div className="max-w-2xl mx-auto">
        <Header t={t} />

        <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6">
          <div>
            <p className="text-sm text-muted">{t.selectedRole}</p>
            <p className="text-lg font-semibold text-foreground">{selectedRole?.title}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t.questionCountLabel}
            </label>
            <input
              type="number"
              min={5}
              max={20}
              value={questionCount}
              onChange={(e) => setQuestionCount(Math.max(5, Math.min(20, parseInt(e.target.value) || 10)))}
              className="w-32 px-4 py-3 rounded-xl border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="text-xs text-muted mt-1">{t.questionCountHint}</p>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-danger text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setSessionState('select-role'); setError(''); }}
              className="px-6 py-3 border border-border/50 text-foreground font-medium rounded-xl hover:bg-background transition-colors"
            >
              {t.back}
            </button>
            <button
              onClick={startSession}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              {t.generateQuestions}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (sessionState === 'loading') {
    return (
      <div className="max-w-2xl mx-auto">
        <Header t={t} />
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <div className="relative mx-auto w-16 h-16 mb-6">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary animate-pulse" />
            </div>
          </div>
          <p className="text-foreground font-semibold text-lg">{t.generating}</p>
          <p className="text-muted text-sm mt-2">{t.generatingHint}</p>
        </div>
      </div>
    );
  }

  // Active session — showing questions
  if (sessionState === 'active') {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-foreground">{roleTitle}</h1>
            <span className="text-sm font-mono text-muted">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div className="h-2 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="bg-card border border-border/50 rounded-2xl p-8 md:p-12 shadow-sm min-h-[300px] flex flex-col justify-center">
          <div className="flex items-start gap-4 mb-8">
            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">{currentIndex + 1}</span>
            </div>
            <p className="text-xl md:text-2xl font-medium text-foreground leading-relaxed">
              {questions[currentIndex]}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted">
            <Users className="h-4 w-4" />
            <span>{t.candidatesWriting}</span>
          </div>
        </div>

        {/* Next button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={nextQuestion}
            className="flex items-center gap-2 px-8 py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors text-lg shadow-lg shadow-primary/20"
          >
            {currentIndex < questions.length - 1 ? (
              <>
                {t.nextReady}
                <ChevronRight className="h-5 w-5" />
              </>
            ) : (
              <>
                {t.finish}
                <CheckCircle2 className="h-5 w-5" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Finished
  if (sessionState === 'finished') {
    return (
      <div className="max-w-2xl mx-auto">
        <Header t={t} />
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{t.sessionComplete}</h2>
          <p className="text-muted mb-6">{t.sessionCompleteHint}</p>
          <button
            onClick={resetSession}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            {t.newSession}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Header Component ───
function Header({ t }: { t: typeof es }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
          <p className="text-sm text-muted">{t.subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ─── i18n ───
const es = {
  title: 'Entrevista Grupal Presencial',
  subtitle: 'Guia de preguntas asistida por IA para sesiones presenciales',
  selectRole: 'Selecciona la vacante',
  selectPlaceholder: '-- Elige una vacante --',
  topics: 'temas',
  continue: 'Continuar',
  back: 'Atras',
  selectedRole: 'Vacante seleccionada:',
  questionCountLabel: 'Numero de preguntas',
  questionCountHint: 'Minimo 5, maximo 20. Zara generara las preguntas basadas en la vacante.',
  generateQuestions: 'Generar Preguntas con IA',
  generating: 'Zara esta preparando las preguntas...',
  generatingHint: 'Esto solo toma unos segundos',
  candidatesWriting: 'Los candidatos estan escribiendo su respuesta en papel',
  nextReady: 'Listo, siguiente pregunta',
  finish: 'Finalizar sesion',
  sessionComplete: 'Sesion finalizada',
  sessionCompleteHint: 'Todas las preguntas fueron presentadas. Recoge las hojas de respuestas de los candidatos.',
  newSession: 'Nueva sesion',
  noRoles: 'No hay vacantes creadas',
  noRolesHint: 'Crea una vacante primero en "Crear Puesto" para poder usar esta herramienta.',
  errorLoadingRoles: 'Error al cargar las vacantes',
  errorGenerating: 'Error al generar preguntas',
};

const en = {
  title: 'In-Person Group Interview',
  subtitle: 'AI-assisted question guide for in-person group sessions',
  selectRole: 'Select the role',
  selectPlaceholder: '-- Choose a role --',
  topics: 'topics',
  continue: 'Continue',
  back: 'Back',
  selectedRole: 'Selected role:',
  questionCountLabel: 'Number of questions',
  questionCountHint: 'Minimum 5, maximum 20. Zara will generate questions based on the role.',
  generateQuestions: 'Generate Questions with AI',
  generating: 'Zara is preparing the questions...',
  generatingHint: 'This only takes a few seconds',
  candidatesWriting: 'Candidates are writing their answer on paper',
  nextReady: 'Ready, next question',
  finish: 'Finish session',
  sessionComplete: 'Session complete',
  sessionCompleteHint: 'All questions were presented. Collect the answer sheets from candidates.',
  newSession: 'New session',
  noRoles: 'No roles created yet',
  noRolesHint: 'Create a role first in "Create Role" to use this tool.',
  errorLoadingRoles: 'Error loading roles',
  errorGenerating: 'Error generating questions',
};
