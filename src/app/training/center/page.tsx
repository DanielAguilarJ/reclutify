'use client';

/**
 * Centro de Capacitación del empleado.
 *
 * ── Qué cambió y por qué ──────────────────────────────────────────────────────
 *
 * La pantalla era una columna de tarjetas del mismo peso: bienvenida, progreso y
 * cada módulo pesaban lo mismo, así que nada guiaba la mirada y el empleado
 * tenía que buscar cuál era su módulo. Ahora la estructura es la de una
 * plataforma de cursos:
 *
 * · Columna lateral persistente con el índice del programa y el progreso global
 *   compacto (`ProgramOutline`), deslizable en móvil.
 * · Una sola acción primaria arriba de la columna principal (`ContinueBlock`):
 *   el módulo que le toca, con un botón que lo abre.
 * · Tutor IA en panel acoplado y colapsable, no en burbuja flotante.
 *
 * Fuera: confeti aleatorio, animaciones en bucle infinito, el anillo de progreso
 * con degradado, el escalonado de entrada de la lista y los ~25 hex de marca
 * escritos a mano (ahora tokens `accent*` del tema).
 *
 * El idioma lo fija el PROGRAMA (`useTrainingContentLanguage`), no la
 * preferencia de la aplicación: el empleado entra por enlace de token y su
 * interfaz tiene que hablar el mismo idioma que el contenido que va a leer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useTrainingStore,
  useTrainingContentLanguage,
} from '@/store/trainingStore';
import { getTrainingCopy } from '@/lib/training/center-copy';
import {
  buildLearningPlan,
  resolveNextAction,
} from '@/lib/training/learning-plan';
import { TrainingShell } from '@/components/training/TrainingShell';
import { ProgramOutline } from '@/components/training/ProgramOutline';
import { ContinueBlock } from '@/components/training/ContinueBlock';
import { CompletionSummary } from '@/components/training/CompletionSummary';
import { TutorPanel } from '@/components/training/TutorPanel';
import { cardSurface } from '@/components/training/ui';

export default function TrainingCenterPage() {
  const router = useRouter();
  const language = useTrainingContentLanguage();
  const copy = getTrainingCopy(language).center;

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

  const [tutorOpen, setTutorOpen] = useState(false);
  const [openingModuleId, setOpeningModuleId] = useState<string | null>(null);
  const [tutorError, setTutorError] = useState<string | null>(null);
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
  }, [employee, loading, initializeFromSession, router]);

  // Cargar el mensaje de inicio del tutor general al abrir el panel
  useEffect(() => {
    if (tutorOpen && generalMessages.length === 0) {
      void startGeneralChat().catch((error: unknown) => {
        console.error('[Training Center] Could not start general chat:', error);
      });
    }
  }, [tutorOpen, generalMessages.length, startGeneralChat]);

  const plan = useMemo(
    () => buildLearningPlan(modules, progress),
    [modules, progress]
  );

  const programComplete =
    phase === 'complete' || employee?.status === 'completed';

  const nextAction = useMemo(
    () => resolveNextAction(plan, programComplete),
    [plan, programComplete]
  );

  if (loading || !employee) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          role="status"
          className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin motion-reduce:animate-none"
        >
          <span className="sr-only">{copy.loading}</span>
        </div>
      </div>
    );
  }

  const handleOpenModule = async (moduleId: string) => {
    const item = plan.items.find((entry) => entry.module.id === moduleId);

    if (!item || item.status === 'locked') return;

    setOpeningModuleId(moduleId);

    try {
      // Un módulo completado se abre para repasar: no se reinicia su progreso.
      if (item.status === 'available' || item.status === 'in_progress') {
        await startModule(moduleId);
      }

      router.push(`/training/center/module/${moduleId}`);
    } catch (error: unknown) {
      setOpeningModuleId(null);

      console.error('[Training Center] Could not open module:', error);
    }
  };

  const handleSendToTutor = async (message: string) => {
    setTutorError(null);

    try {
      await sendGeneralMessage(message);
    } catch (error: unknown) {
      console.error('[Training Center] Could not send general message:', error);

      setTutorError(
        error instanceof Error ? error.message : copy.tutor.retry
      );

      throw error;
    }
  };

  const firstName = employee.name.split(' ')[0];

  return (
    <TrainingShell
      language={language}
      sidebar={
        <ProgramOutline
          language={language}
          plan={plan}
          programTitle={program?.title}
          overallScore={employee.overallScore}
          onSelectModule={(moduleId) => void handleOpenModule(moduleId)}
        />
      }
    >
      <div className="space-y-6">
        <header>
          {/* Único rótulo en mayúsculas de la pantalla. */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {copy.eyebrow}
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.greeting(firstName)}
          </h1>

          <p className="mt-1 text-sm text-foreground/70">
            {[employee.roleTitle, program?.title ?? copy.programFallbackTitle]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>

        {programComplete ? (
          <CompletionSummary
            language={language}
            employeeName={employee.name}
            programTitle={program?.title}
            overallScore={employee.overallScore}
            completedAt={employee.completedAt}
          />
        ) : (
          <ContinueBlock
            language={language}
            action={nextAction}
            busy={openingModuleId !== null}
            onOpenModule={(moduleId) => void handleOpenModule(moduleId)}
          />
        )}

        {nextAction.kind === 'start' && program?.welcomeMessage ? (
          <section className={`${cardSurface} p-5`}>
            <p className="max-w-prose text-sm leading-relaxed text-foreground/85">
              {program.welcomeMessage}
            </p>
          </section>
        ) : null}

        <TutorPanel
          language={language}
          title={copy.tutor.title}
          messages={generalMessages}
          aiSpeaking={aiSpeaking}
          open={tutorOpen}
          onOpenChange={setTutorOpen}
          onSend={handleSendToTutor}
          placeholder={copy.tutor.placeholder}
          emptyHint={copy.tutor.empty}
          errorMessage={tutorError}
        />
      </div>
    </TrainingShell>
  );
}
