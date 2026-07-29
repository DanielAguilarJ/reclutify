/**
 * Plan de aprendizaje del empleado: el orden de los módulos, su estado y —lo
 * que faltaba en la pantalla— cuál es el módulo que le toca ahora.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────
 *
 * El Centro de Capacitación mostraba una lista de tarjetas idénticas y dejaba
 * que el empleado adivinara cuál era la suya. La única acción primaria de la
 * pantalla ("continúa donde lo dejaste") depende de cruzar `modules` con
 * `progress`, y eso es lógica, no presentación: vive aquí para poder probarla
 * sin renderizar nada y para que la vista de módulo reutilice el mismo orden en
 * la navegación anterior/siguiente.
 *
 * No toca el store ni la API: son funciones puras sobre lo que el store ya
 * tiene cargado.
 */
import type {
  EmployeeTrainingModule,
  TrainingProgress,
  TrainingProgressStatus,
} from '@/types';

export interface LearningPlanItem {
  module: EmployeeTrainingModule;
  /** Posición 1-based dentro del plan ordenado. */
  position: number;
  status: TrainingProgressStatus;
  progress?: TrainingProgress;
}

export interface LearningPlan {
  items: LearningPlanItem[];
  total: number;
  completedCount: number;
  /** Porcentaje redondeado de módulos completados. `0` si el plan está vacío. */
  percent: number;
  /** Minutos dedicados sumando todo el progreso conocido. */
  totalTimeSpent: number;
}

/**
 * Qué hacer al entrar. `module` es `null` solo cuando no hay nada que abrir
 * (plan vacío, todo bloqueado o programa terminado).
 */
export type TrainingNextActionKind =
  /** Nada empezado: se invita al primer módulo disponible. */
  | 'start'
  /** Hay algo en curso o ya completado: se retoma el siguiente. */
  | 'resume'
  /** No queda nada por abrir pero sí algo completado y el programa no cerró. */
  | 'review'
  /** Programa terminado: la pantalla muestra el cierre, no una acción. */
  | 'complete'
  /** Plan vacío. */
  | 'empty'
  /** Hay módulos, pero ninguno accesible todavía. */
  | 'locked';

export interface TrainingNextAction {
  kind: TrainingNextActionKind;
  item: LearningPlanItem | null;
}

/**
 * Orden estable del plan. `sortOrder` puede llegar sin definir desde datos
 * antiguos, así que se normaliza a 0 en vez de producir `NaN` y un orden
 * aleatorio.
 */
export function sortModulesByOrder(
  modules: EmployeeTrainingModule[]
): EmployeeTrainingModule[] {
  return [...modules].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
}

export function buildLearningPlan(
  modules: EmployeeTrainingModule[],
  progress: TrainingProgress[]
): LearningPlan {
  const items: LearningPlanItem[] = sortModulesByOrder(modules).map(
    (module, index) => {
      const moduleProgress = progress.find(
        (entry) => entry.moduleId === module.id
      );

      return {
        module,
        position: index + 1,
        // Sin fila de progreso el módulo está bloqueado: es el mismo criterio
        // que aplicaba la pantalla antes del rediseño.
        status: moduleProgress?.status ?? 'locked',
        progress: moduleProgress,
      };
    }
  );

  const completedCount = items.filter(
    (item) => item.status === 'completed'
  ).length;

  return {
    items,
    total: items.length,
    completedCount,
    percent:
      items.length > 0
        ? Math.round((completedCount / items.length) * 100)
        : 0,
    totalTimeSpent: progress.reduce(
      (total, entry) => total + (entry.timeSpent || 0),
      0
    ),
  };
}

/**
 * Resuelve la acción primaria de la pantalla.
 *
 * `programComplete` viene de la fase del store o del estado del empleado: el
 * programa puede estar cerrado sin que todas las filas de progreso lo estén, y
 * en ese caso manda el cierre.
 */
export function resolveNextAction(
  plan: LearningPlan,
  programComplete = false
): TrainingNextAction {
  if (plan.total === 0) {
    return { kind: 'empty', item: null };
  }

  if (programComplete || plan.completedCount === plan.total) {
    return { kind: 'complete', item: null };
  }

  const inProgress = plan.items.find((item) => item.status === 'in_progress');

  if (inProgress) {
    return { kind: 'resume', item: inProgress };
  }

  const available = plan.items.find((item) => item.status === 'available');

  if (available) {
    return {
      // "Empieza" solo la primera vez; después es retomar el plan.
      kind: plan.completedCount > 0 ? 'resume' : 'start',
      item: available,
    };
  }

  const lastCompleted = [...plan.items]
    .reverse()
    .find((item) => item.status === 'completed');

  if (lastCompleted) {
    return { kind: 'review', item: lastCompleted };
  }

  return { kind: 'locked', item: null };
}

export interface LearningPlanNeighbors {
  previous: LearningPlanItem | null;
  next: LearningPlanItem | null;
  current: LearningPlanItem | null;
}

/** Vecinos de un módulo en el plan, para la navegación anterior/siguiente. */
export function findPlanNeighbors(
  plan: LearningPlan,
  moduleId: string
): LearningPlanNeighbors {
  const index = plan.items.findIndex((item) => item.module.id === moduleId);

  if (index === -1) {
    return { previous: null, next: null, current: null };
  }

  return {
    previous: plan.items[index - 1] ?? null,
    next: plan.items[index + 1] ?? null,
    current: plan.items[index],
  };
}

/** `45 min`, `1 h 20 min`. Los dos idiomas usan las mismas abreviaturas. */
export function formatMinutes(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;

  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Un módulo se puede abrir cuando no está bloqueado. */
export function isModuleOpenable(status: TrainingProgressStatus): boolean {
  return status !== 'locked';
}
