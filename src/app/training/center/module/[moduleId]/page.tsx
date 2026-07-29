'use client';

/**
 * Vista de un módulo de capacitación.
 *
 * ── Qué cambió y por qué ──────────────────────────────────────────────────────
 *
 * La pantalla era solo el chat con el tutor: las secciones que la IA genera para
 * el programa aparecían únicamente como títulos en la lateral, así que el
 * material escrito para el empleado no se podía leer. Ahora manda la lectura:
 *
 * · `ModuleReader` presenta las secciones como documento, con ancho de línea de
 *   ~68 caracteres y un encabezado por sección.
 * · La lateral es el mismo índice del programa que el Centro (`ProgramOutline`)
 *   más la lista de lectura del módulo, que ahora son enlaces reales a cada
 *   sección.
 * · El tutor es un panel acoplado y colapsable (`TutorPanel`) que convive con la
 *   lectura en vez de taparla.
 * · `ModulePager` añade la navegación anterior/siguiente que no existía.
 *
 * El idioma sigue viniendo del PROGRAMA (`useTrainingContentLanguage`), no de la
 * preferencia de la aplicación. Toda la lógica de sesión, inicio de módulo,
 * temporizador y evaluación se conserva tal cual.
 */

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  useTrainingStore,
  useTrainingContentLanguage,
  type EvaluationDetail,
} from '@/store/trainingStore';
import type { TrainingQuestionPublic } from '@/types';
import { getTrainingCopy } from '@/lib/training/center-copy';
import {
  buildLearningPlan,
  findPlanNeighbors,
  formatMinutes,
} from '@/lib/training/learning-plan';
import { TrainingShell } from '@/components/training/TrainingShell';
import { ProgramOutline } from '@/components/training/ProgramOutline';
import {
  ModuleReader,
  moduleSectionId,
} from '@/components/training/ModuleReader';
import { ModulePager } from '@/components/training/ModulePager';
import { TutorPanel } from '@/components/training/TutorPanel';
import {
  cardSurface,
  focusRing,
  iconButton,
  primaryButton,
  readingWidth,
  secondaryButton,
} from '@/components/training/ui';

interface EvaluationFeedbackState {
  passed: boolean;
  score: number;
  passingScore: number;
  details: EvaluationDetail[];
}

type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'failed';

export default function TrainingModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = use(params);
  const router = useRouter();
  const language = useTrainingContentLanguage();
  const copy = getTrainingCopy(language).module;

  const {
    employee,
    program,
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

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('idle');
  const [tutorOpen, setTutorOpen] = useState(true);

  // Estados locales de la evaluación
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluationFeedback, setEvaluationFeedback] =
    useState<EvaluationFeedbackState | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [submittingEvaluation, setSubmittingEvaluation] = useState(false);

  const bootstrapStartedRef = useRef(false);
  const initializedModuleIdRef = useRef<string | null>(null);

  const currentModule = modules.find((m) => m.id === moduleId);
  const moduleProgress = progress.find((p) => p.moduleId === moduleId);
  const isCompleted = moduleProgress?.status === 'completed';

  const messages = moduleMessages[moduleId] || [];

  const plan = useMemo(
    () => buildLearningPlan(modules, progress),
    [modules, progress]
  );

  const neighbors = useMemo(
    () => findPlanNeighbors(plan, moduleId),
    [plan, moduleId]
  );

  // Primer efecto: bootstrap de sesión
  useEffect(() => {
    if (bootstrapStartedRef.current) return;

    bootstrapStartedRef.current = true;
    setBootstrapStatus('loading');

    void (async () => {
      try {
        const initialized = employee ? true : await initializeFromSession();

        if (!initialized) {
          setBootstrapStatus('failed');
          router.replace('/');
          return;
        }

        setBootstrapStatus('ready');
      } catch (error: unknown) {
        console.error('[Training Module] Session bootstrap failed:', error);

        setError(
          error instanceof Error
            ? error.message
            : 'Failed to initialize training session'
        );
        setBootstrapStatus('failed');
        router.replace('/');
      }
    })();
  }, [employee, initializeFromSession, router]);

  // Segundo efecto: validación e inicio del módulo
  useEffect(() => {
    if (bootstrapStatus !== 'ready' || !employee) return;
    if (initializedModuleIdRef.current === moduleId) return;

    const targetModule = modules.find((module) => module.id === moduleId);

    const targetProgress = progress.find((item) => item.moduleId === moduleId);

    if (!targetModule || !targetProgress || targetProgress.status === 'locked') {
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

        console.error('[Training Module] Module initialization failed:', error);

        setError(
          error instanceof Error ? error.message : 'Failed to initialize module'
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

  // Al cambiar de módulo la evaluación vuelve a su estado inicial
  useEffect(() => {
    setIsEvaluating(false);
    setEvaluationComplete(false);
    setEvaluationFeedback(null);
    setEvaluationError(null);
    setAnswers({});
  }, [moduleId]);

  // Contar el tiempo cada minuto, solo con la pestaña visible
  const moduleStatus = moduleProgress?.status;

  useEffect(() => {
    if (moduleStatus !== 'in_progress' || isEvaluating || evaluationComplete) {
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
  }, [
    moduleId,
    moduleStatus,
    isEvaluating,
    evaluationComplete,
    incrementTimeSpent,
  ]);

  const handleSendToTutor = async (message: string) => {
    setError(null);

    try {
      await sendModuleMessage(moduleId, message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');

      throw err;
    }
  };

  const handleSubmitEvaluation = async () => {
    const questionsCount = currentModule?.evaluationQuestions?.length || 0;
    const answeredCount = Object.values(answers).filter(
      (value) => value.trim().length > 0
    ).length;

    if (answeredCount < questionsCount) {
      setEvaluationError(copy.evaluation.unanswered);
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
      setEvaluationError(
        err instanceof Error ? err.message : 'Error grading evaluation'
      );
    } finally {
      setSubmittingEvaluation(false);
    }
  };

  const handleCompleteWithoutEvaluation = async () => {
    setSubmittingEvaluation(true);

    try {
      const ok = await completeModuleWithoutEvaluation(moduleId);

      if (ok) {
        setEvaluationFeedback({
          passed: true,
          score: 100,
          passingScore: 100,
          details: [],
        });
        setEvaluationComplete(true);
        setIsEvaluating(false);
      } else {
        setError(copy.completeModuleFailed);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete module');
    } finally {
      setSubmittingEvaluation(false);
    }
  };

  const handleRetryEvaluation = () => {
    setAnswers({});
    setEvaluationFeedback(null);
    setEvaluationComplete(false);
    setIsEvaluating(true);
    setEvaluationError(null);
  };

  if (bootstrapStatus === 'idle' || bootstrapStatus === 'loading') {
    return <ModuleLoading label={getTrainingCopy(language).center.loading} />;
  }

  if (bootstrapStatus === 'failed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div
          className={`${cardSurface} flex max-w-md flex-col items-center gap-3 p-5 text-center`}
        >
          <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
          <h1 className="text-base font-semibold">{copy.loadErrorTitle}</h1>
          {error ? <p className="text-sm text-muted">{error}</p> : null}
          <button
            type="button"
            onClick={() => router.push('/training/center')}
            className={`mt-1 ${primaryButton}`}
          >
            {copy.backToCenter}
          </button>
        </div>
      </div>
    );
  }

  if (!employee || !currentModule) {
    return <ModuleLoading label={getTrainingCopy(language).center.loading} />;
  }

  const sections = currentModule.content?.sections ?? [];
  const position = neighbors.current?.position ?? 1;
  const showReading = !isEvaluating && !evaluationComplete;

  const topBar = (
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => router.push('/training/center')}
          aria-label={copy.back}
          className={iconButton}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {currentModule.title}
          </p>
          <p className="flex items-center gap-2 text-xs text-foreground/70">
            <span>{copy.position(position, plan.total)}</span>
            {typeof currentModule.durationEstimate === 'number' ? (
              <span>{copy.minutes(currentModule.durationEstimate)}</span>
            ) : null}
            {moduleProgress?.timeSpent ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {copy.timeSpentShort(formatMinutes(moduleProgress.timeSpent))}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!isCompleted && !isEvaluating && !evaluationComplete ? (
          currentModule.evaluationEnabled ? (
            <>
              {moduleEvaluationReady?.[moduleId] ? (
                <span className="hidden items-center gap-1 text-xs text-accent sm:inline-flex">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.evaluationReadyHint}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setIsEvaluating(true)}
                className={`${primaryButton} px-4 py-2`}
              >
                <Award className="h-4 w-4" aria-hidden="true" />
                {copy.takeEvaluation}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCompleteWithoutEvaluation}
              disabled={submittingEvaluation}
              className={`${primaryButton} px-4 py-2`}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {copy.completeModule}
            </button>
          )
        ) : null}

        {isEvaluating ? (
          <button
            type="button"
            onClick={() => setIsEvaluating(false)}
            className={`${secondaryButton} px-3 py-2`}
          >
            {copy.backToStudy}
          </button>
        ) : null}
      </div>
    </div>
  );

  const sidebar = (
    <div className="space-y-6">
      <ProgramOutline
        language={language}
        plan={plan}
        programTitle={program?.title}
        activeModuleId={moduleId}
        overallScore={employee.overallScore}
        onSelectModule={(targetId) =>
          router.push(`/training/center/module/${targetId}`)
        }
      />

      {showReading && sections.length > 0 ? (
        <nav aria-label={copy.readingList}>
          <h2 className="text-sm font-semibold text-foreground">
            {copy.readingList}
          </h2>
          <ol className="mt-2 space-y-0.5">
            {sections.map((section, index) => (
              <li key={index}>
                <a
                  href={`#${moduleSectionId(index)}`}
                  className={`block rounded-md px-2 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-surface-hover hover:text-foreground ${focusRing}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </div>
  );

  return (
    <TrainingShell language={language} topBar={topBar} sidebar={sidebar}>
      {isEvaluating && !evaluationComplete ? (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5">
            <h1 className="text-lg font-semibold tracking-tight">
              {copy.evaluation.title}
            </h1>
            <p className="mt-1 text-sm text-foreground/75">{copy.evaluation.subtitle}</p>
          </div>

          <div className="space-y-4">
            {currentModule.evaluationQuestions.map(
              (question: TrainingQuestionPublic, index: number) => (
                <div key={index} className={`${cardSurface} space-y-4 p-5`}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-xs font-semibold text-accent">
                      {index + 1}
                    </span>
                    <p className="text-sm font-medium">{question.question}</p>
                  </div>

                  {question.type === 'multiple_choice' ||
                  question.type === 'true_false' ? (
                    <div className="grid gap-2 pl-8">
                      {(question.options || []).map(
                        (option: string, optionIndex: number) => (
                          <label
                            key={optionIndex}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                              answers[index] === option
                                ? 'border-accent bg-accent-soft text-foreground'
                                : 'border-border text-muted hover:bg-surface-hover hover:text-foreground'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${index}`}
                              value={option}
                              checked={answers[index] === option}
                              onChange={() =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [index]: option,
                                }))
                              }
                              className={`h-4 w-4 accent-accent ${focusRing}`}
                            />
                            <span>{option}</span>
                          </label>
                        )
                      )}
                    </div>
                  ) : null}

                  {question.type === 'open_ended' ? (
                    <div className="pl-8">
                      <textarea
                        value={answers[index] || ''}
                        onChange={(event) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [index]: event.target.value,
                          }))
                        }
                        placeholder={copy.evaluation.openPlaceholder}
                        rows={3}
                        aria-label={question.question}
                        className={`w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted ${focusRing}`}
                      />
                    </div>
                  ) : null}
                </div>
              )
            )}
          </div>

          {evaluationError ? (
            <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {evaluationError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsEvaluating(false)}
              className={secondaryButton}
            >
              {copy.evaluation.cancel}
            </button>
            <button
              type="button"
              onClick={handleSubmitEvaluation}
              disabled={submittingEvaluation}
              className={primaryButton}
            >
              {copy.evaluation.submit}
            </button>
          </div>
        </div>
      ) : null}

      {evaluationComplete && evaluationFeedback ? (
        <div className="max-w-2xl space-y-6">
          <div className={`${cardSurface} p-5 sm:p-6`}>
            <div className="flex items-start gap-4">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  evaluationFeedback.passed
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {evaluationFeedback.passed ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                )}
              </span>

              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {evaluationFeedback.passed
                    ? copy.evaluation.passedTitle
                    : copy.evaluation.failedTitle}
                </h1>

                {currentModule.evaluationEnabled ? (
                  <p className="mt-1 text-sm text-muted">
                    {copy.evaluation.scoreLine(
                      evaluationFeedback.score,
                      evaluationFeedback.passingScore
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {currentModule.evaluationEnabled ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">
                {copy.evaluation.review}
              </h2>

              {(evaluationFeedback.details || []).map(
                (detail: EvaluationDetail, index: number) => (
                  <div
                    key={index}
                    className={`rounded-xl border p-4 ${
                      detail.correct
                        ? 'border-success/30 bg-success/5'
                        : 'border-danger/30 bg-danger/5'
                    }`}
                  >
                    <div className="flex gap-2.5">
                      {detail.correct ? (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-success"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircle
                          className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                          aria-hidden="true"
                        />
                      )}
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium">{detail.question}</p>
                        <p className="text-sm">
                          <span className="text-muted">
                            {copy.evaluation.yourAnswer}
                          </span>
                          <span className="font-medium">
                            {detail.userAnswer}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
            {!evaluationFeedback.passed && currentModule.evaluationEnabled ? (
              <button
                type="button"
                onClick={handleRetryEvaluation}
                className={secondaryButton}
              >
                {copy.evaluation.retry}
              </button>
            ) : null}

            {neighbors.next && neighbors.next.status !== 'locked' ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/training/center/module/${neighbors.next?.module.id}`
                  )
                }
                className={secondaryButton}
              >
                {copy.next}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => router.push('/training/center')}
              className={primaryButton}
            >
              {copy.evaluation.goToCenter}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {showReading ? (
        <div className="space-y-8">
          <header className={readingWidth}>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {currentModule.title}
            </h1>
            <p className="mt-2 text-sm text-foreground/70">
              {[
                copy.position(position, plan.total),
                typeof currentModule.durationEstimate === 'number'
                  ? copy.minutes(currentModule.durationEstimate)
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </header>

          <ModuleReader
            language={language}
            description={currentModule.description}
            sections={sections}
          />

          <ModulePager
            language={language}
            previous={neighbors.previous}
            next={neighbors.next}
            onNavigate={(targetId) =>
              router.push(`/training/center/module/${targetId}`)
            }
          />

          <TutorPanel
            language={language}
            title={copy.tutorTitle}
            messages={messages}
            aiSpeaking={aiSpeaking}
            open={tutorOpen}
            onOpenChange={setTutorOpen}
            onSend={handleSendToTutor}
            placeholder={copy.tutorPlaceholder}
            emptyHint={copy.tutorEmpty}
            errorMessage={error}
          />
        </div>
      ) : null}
    </TrainingShell>
  );
}

function ModuleLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div
        role="status"
        className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin motion-reduce:animate-none"
      >
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
