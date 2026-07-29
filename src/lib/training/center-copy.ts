/**
 * Textos de las pantallas del empleado (Centro de Capacitación y vista de
 * módulo).
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────
 *
 * El idioma de estas pantallas lo fija el PROGRAMA
 * (`training_programs.content_language`, expuesto por
 * `useTrainingContentLanguage`), no la preferencia de la aplicación: el empleado
 * entra por enlace de token y no tiene preferencia guardada. Antes cada cadena
 * era un ternario `language === 'es' ? … : …` incrustado en el JSX; con el
 * rediseño de dos columnas el número de cadenas se multiplica y los ternarios
 * dejan de caber en la lectura del componente.
 *
 * Este módulo NO introduce un sistema de internacionalización: es el mismo
 * mecanismo (una unión de dos idiomas resuelta desde el programa) con las
 * cadenas agrupadas en un único sitio, de modo que falta un idioma es un error
 * de tipos y no un ternario olvidado.
 *
 * Varias cadenas están fijadas por pruebas existentes (los rótulos de la
 * evaluación y de la lista de lectura). Están marcadas para que no se
 * "mejoren" sin actualizar esas pruebas a la vez.
 */
import type { TrainingContentLanguage } from './content-language';

interface TrainingCenterCopy {
  /** Único rótulo en mayúsculas de la pantalla. */
  eyebrow: string;
  greeting: (firstName: string) => string;
  programFallbackTitle: string;
  loading: string;

  outline: {
    /** `aria-label` de la navegación del índice. */
    navLabel: string;
    title: string;
    openDrawer: string;
    closeDrawer: string;
    progress: (percent: number) => string;
    moduleCount: (completed: number, total: number) => string;
    timeSpent: string;
    score: string;
    empty: string;
    moduleNumber: (position: number) => string;
    status: {
      locked: string;
      available: string;
      inProgress: string;
      completed: string;
    };
  };

  next: {
    startEyebrow: string;
    resumeEyebrow: string;
    reviewEyebrow: string;
    startAction: string;
    resumeAction: string;
    reviewAction: string;
    lockedTitle: string;
    lockedBody: string;
    emptyTitle: string;
    emptyBody: string;
    sections: (count: number) => string;
  };

  completion: {
    title: string;
    body: string;
    certificateLabel: string;
    scoreLabel: string;
    reviewHint: string;
  };

  tutor: {
    title: string;
    open: string;
    close: string;
    empty: string;
    placeholder: string;
    send: string;
    thinking: string;
    logLabel: string;
    sources: string;
    retry: string;
  };
}

interface TrainingModuleCopy {
  back: string;
  position: (position: number, total: number) => string;
  /** Fijado por `src/__tests__/training/page.test.tsx`. */
  readingList: string;
  keyPoints: string;
  emptyContent: string;
  minutes: (minutes: number) => string;
  timeSpentShort: (formatted: string) => string;
  previous: string;
  next: string;
  nextLocked: string;
  pagerLabel: string;
  tutorTitle: string;
  tutorPlaceholder: string;
  tutorEmpty: string;
  evaluationReadyHint: string;
  /** Fijado por pruebas. */
  takeEvaluation: string;
  /** Fijado por pruebas. */
  completeModule: string;
  backToStudy: string;
  loadErrorTitle: string;
  backToCenter: string;
  completeModuleFailed: string;

  evaluation: {
    title: string;
    subtitle: string;
    unanswered: string;
    openPlaceholder: string;
    cancel: string;
    /** Fijado por pruebas. */
    submit: string;
    passedTitle: string;
    failedTitle: string;
    scoreLine: (score: number, passingScore: number) => string;
    review: string;
    yourAnswer: string;
    /** Encabezado del bloque de retroalimentación por pregunta. */
    explanation: string;
    /** Fijado por pruebas. */
    retry: string;
    goToCenter: string;
  };
}

export interface TrainingCopy {
  center: TrainingCenterCopy;
  module: TrainingModuleCopy;
}

const COPY: Record<TrainingContentLanguage, TrainingCopy> = {
  es: {
    center: {
      eyebrow: 'Centro de capacitación',
      greeting: (firstName) => `Hola, ${firstName}`,
      programFallbackTitle: 'Tu capacitación',
      loading: 'Cargando tu capacitación',
      outline: {
        navLabel: 'Módulos del programa',
        title: 'Plan de aprendizaje',
        openDrawer: 'Ver el plan de aprendizaje',
        closeDrawer: 'Cerrar el plan de aprendizaje',
        progress: (percent) => `${percent}% completado`,
        moduleCount: (completed, total) =>
          `${completed} de ${total} ${total === 1 ? 'módulo' : 'módulos'}`,
        timeSpent: 'Tiempo dedicado',
        score: 'Calificación',
        empty: 'Todavía no hay módulos en tu plan.',
        moduleNumber: (position) => `Módulo ${position}`,
        status: {
          locked: 'Bloqueado',
          available: 'Disponible',
          inProgress: 'En curso',
          completed: 'Completado',
        },
      },
      next: {
        startEyebrow: 'Empieza por aquí',
        resumeEyebrow: 'Continúa donde lo dejaste',
        reviewEyebrow: 'Repasa lo aprendido',
        startAction: 'Comenzar módulo',
        resumeAction: 'Continuar módulo',
        reviewAction: 'Repasar módulo',
        lockedTitle: 'Tu plan está por abrirse',
        lockedBody:
          'Ningún módulo está disponible todavía. Puedes preguntarle al tutor mientras tanto.',
        emptyTitle: 'Tu plan todavía no tiene módulos',
        emptyBody:
          'En cuanto tu equipo publique el contenido lo verás aquí.',
        sections: (count) =>
          `${count} ${count === 1 ? 'sección de lectura' : 'secciones de lectura'}`,
      },
      completion: {
        title: 'Capacitación completada',
        body: 'Completaste todos los módulos del programa. Puedes volver a cualquiera cuando quieras.',
        certificateLabel: 'Certificado de completación',
        scoreLabel: 'Calificación final',
        reviewHint: 'Elige un módulo del plan para repasarlo.',
      },
      tutor: {
        title: 'Tutor IA',
        open: 'Abrir el tutor',
        close: 'Cerrar el tutor',
        empty: 'Pregunta lo que necesites sobre tu capacitación.',
        placeholder: 'Escribe tu pregunta…',
        send: 'Enviar pregunta',
        thinking: 'El tutor está escribiendo',
        logLabel: 'Conversación con el tutor',
        sources: 'Documentos de referencia',
        retry: 'Reintentar',
      },
    },
    module: {
      back: 'Volver al plan',
      position: (position, total) => `Módulo ${position} de ${total}`,
      readingList: 'Lista de Lectura',
      keyPoints: 'Puntos clave',
      emptyContent:
        'Este módulo no trae material de lectura. Empieza preguntándole al tutor.',
      minutes: (minutes) => `${minutes} min`,
      timeSpentShort: (formatted) => `${formatted} dedicados`,
      previous: 'Módulo anterior',
      next: 'Módulo siguiente',
      nextLocked: 'Completa este módulo para abrir el siguiente',
      pagerLabel: 'Navegación entre módulos',
      tutorTitle: 'Tutor del módulo',
      tutorPlaceholder: 'Haz una pregunta sobre el material...',
      tutorEmpty: 'Pregúntale al tutor sobre cualquier parte del material.',
      evaluationReadyHint: 'Zara cree que ya estás listo',
      takeEvaluation: 'Tomar Evaluación',
      completeModule: 'Completar Módulo',
      backToStudy: 'Volver a Estudiar',
      loadErrorTitle: 'Error al Cargar Módulo',
      backToCenter: 'Volver al Centro',
      completeModuleFailed: 'No se pudo completar el módulo',
      evaluation: {
        title: 'Evaluación del Módulo',
        subtitle:
          'Responde las siguientes preguntas. Las abiertas serán calificadas por IA.',
        unanswered: 'Por favor responde todas las preguntas antes de enviar.',
        openPlaceholder: 'Escribe tu respuesta detallada...',
        cancel: 'Cancelar',
        submit: 'Enviar Evaluación',
        passedTitle: '¡Felicidades, Completaste el Módulo!',
        failedTitle: 'No se alcanzó el mínimo requerido',
        scoreLine: (score, passingScore) =>
          `Puntuación obtenida: ${score}%. Mínimo requerido: ${passingScore}%`,
        review: 'Revisión de Preguntas',
        yourAnswer: 'Tu respuesta: ',
        explanation: 'Retroalimentación',
        retry: 'Reintentar Evaluación',
        goToCenter: 'Ir al Centro de Capacitación',
      },
    },
  },
  en: {
    center: {
      eyebrow: 'Training center',
      greeting: (firstName) => `Hi, ${firstName}`,
      programFallbackTitle: 'Your training',
      loading: 'Loading your training',
      outline: {
        navLabel: 'Program modules',
        title: 'Learning plan',
        openDrawer: 'Show the learning plan',
        closeDrawer: 'Close the learning plan',
        progress: (percent) => `${percent}% complete`,
        moduleCount: (completed, total) =>
          `${completed} of ${total} ${total === 1 ? 'module' : 'modules'}`,
        timeSpent: 'Time spent',
        score: 'Score',
        empty: 'There are no modules in your plan yet.',
        moduleNumber: (position) => `Module ${position}`,
        status: {
          locked: 'Locked',
          available: 'Available',
          inProgress: 'In progress',
          completed: 'Completed',
        },
      },
      next: {
        startEyebrow: 'Start here',
        resumeEyebrow: 'Pick up where you left off',
        reviewEyebrow: 'Review what you learned',
        startAction: 'Start module',
        resumeAction: 'Continue module',
        reviewAction: 'Review module',
        lockedTitle: 'Your plan is about to open',
        lockedBody:
          'No module is available yet. You can ask the tutor in the meantime.',
        emptyTitle: 'Your plan has no modules yet',
        emptyBody: 'As soon as your team publishes the content it shows up here.',
        sections: (count) =>
          `${count} reading ${count === 1 ? 'section' : 'sections'}`,
      },
      completion: {
        title: 'Training complete',
        body: 'You finished every module in the program. You can revisit any of them whenever you want.',
        certificateLabel: 'Certificate of completion',
        scoreLabel: 'Final score',
        reviewHint: 'Pick a module from the plan to review it.',
      },
      tutor: {
        title: 'AI tutor',
        open: 'Open the tutor',
        close: 'Close the tutor',
        empty: 'Ask anything you need about your training.',
        placeholder: 'Type your question…',
        send: 'Send question',
        thinking: 'The tutor is typing',
        logLabel: 'Tutor conversation',
        sources: 'Sources',
        retry: 'Retry',
      },
    },
    module: {
      back: 'Back to plan',
      position: (position, total) => `Module ${position} of ${total}`,
      readingList: 'Reading List',
      keyPoints: 'Key points',
      emptyContent:
        'This module has no reading material. Start by asking the tutor.',
      minutes: (minutes) => `${minutes} min`,
      timeSpentShort: (formatted) => `${formatted} spent`,
      previous: 'Previous module',
      next: 'Next module',
      nextLocked: 'Complete this module to open the next one',
      pagerLabel: 'Module navigation',
      tutorTitle: 'Module tutor',
      tutorPlaceholder: 'Ask a question about the material...',
      tutorEmpty: 'Ask the tutor about any part of the material.',
      evaluationReadyHint: "Zara thinks you're ready",
      takeEvaluation: 'Take Evaluation',
      completeModule: 'Complete Module',
      backToStudy: 'Back to Study',
      loadErrorTitle: 'Error Loading Module',
      backToCenter: 'Back to Center',
      completeModuleFailed: 'Failed to complete module',
      evaluation: {
        title: 'Module Evaluation',
        subtitle:
          'Answer the following questions. Open-ended questions will be graded by AI.',
        unanswered: 'Please answer all questions before submitting.',
        openPlaceholder: 'Type your detailed response...',
        cancel: 'Cancel',
        submit: 'Submit Evaluation',
        passedTitle: 'Congratulations, Module Completed!',
        failedTitle: 'Did not meet requirements',
        scoreLine: (score, passingScore) =>
          `Your score: ${score}%. Required minimum: ${passingScore}%`,
        review: 'Questions Review',
        yourAnswer: 'Your answer: ',
        explanation: 'Feedback',
        retry: 'Retry Evaluation',
        goToCenter: 'Go to Training Center',
      },
    },
  },
};

/** Textos de la pantalla en el idioma del programa. */
export function getTrainingCopy(language: TrainingContentLanguage): TrainingCopy {
  return COPY[language];
}

/** Etiqueta de fecha en la variante regional del idioma del programa. */
export function formatTrainingDate(
  isoDate: string,
  language: TrainingContentLanguage
): string {
  return new Date(isoDate).toLocaleDateString(
    language === 'es' ? 'es-MX' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );
}
