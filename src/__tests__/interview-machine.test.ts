// @vitest-environment node

import { describe, it, expect } from 'vitest';

import {
  deriveInterviewFlags,
  describeRejectedEvent,
  initialInterviewPhase,
  interviewReducer,
  isInterviewActive,
  type InterviewEvent,
  type InterviewEventType,
  type InterviewTurnState,
  type InterviewStatus,
} from '@/lib/interview/machine';

/**
 * Pruebas de la máquina de estados de la entrevista.
 *
 * QUÉ SE COMPRUEBA Y POR QUÉ ASÍ
 * ------------------------------
 * La máquina sustituye cuatro booleanos independientes que permitían once combinaciones
 * imposibles. El valor no está en las transiciones que funcionan: está en las que se
 * RECHAZAN. Por eso hay una matriz completa de estado × evento, y cada rechazo relevante
 * tiene además su propia prueba con el fallo concreto que evita.
 *
 * El rechazo se detecta por identidad: el reductor devuelve el mismo objeto cuando el
 * evento no corresponde al estado. Eso hace que `useReducer` omita el renderizado y permite
 * comprobarlo con `toBe`.
 */

/** Todos los estados, para recorrer la matriz. */
const ALL_STATUSES: readonly InterviewStatus[] = [
  'idle',
  'preparing',
  'aiSpeaking',
  'awaitingCandidate',
  'listening',
  'transcribing',
  'processing',
  'finished',
  'failed',
];

/** Construye un estado de ejemplo para cada nombre. */
function phaseOf(status: InterviewStatus): InterviewTurnState {
  switch (status) {
    case 'idle':
      return { status: 'idle' };
    case 'preparing':
      return { status: 'preparing' };
    case 'aiSpeaking':
      return { status: 'aiSpeaking', text: 'Cuéntame sobre React.' };
    case 'awaitingCandidate':
      return { status: 'awaitingCandidate' };
    case 'listening':
      return { status: 'listening', startedAt: 1_000 };
    case 'transcribing':
      return { status: 'transcribing' };
    case 'processing':
      return { status: 'processing', startedAt: 2_000, slow: false };
    case 'finished':
      return { status: 'finished', reason: 'completed' };
    case 'failed':
      return { status: 'failed', message: 'red', recoverable: true };
  }
}

/** Un evento de ejemplo por tipo. */
const EVENTS: Record<InterviewEventType, InterviewEvent> = {
  START: { type: 'START' },
  OPENING_READY: { type: 'OPENING_READY', text: 'Hola, soy Zara.' },
  SPEECH_STARTED: { type: 'SPEECH_STARTED', text: 'Siguiente pregunta.' },
  SPEECH_ENDED: { type: 'SPEECH_ENDED' },
  CANDIDATE_TURN_STARTED: { type: 'CANDIDATE_TURN_STARTED', at: 3_000 },
  CANDIDATE_TURN_SUBMITTED: { type: 'CANDIDATE_TURN_SUBMITTED' },
  TRANSCRIPTION_SETTLED: { type: 'TRANSCRIPTION_SETTLED', at: 4_000 },
  TRANSCRIPTION_EMPTY: { type: 'TRANSCRIPTION_EMPTY' },
  PROCESSING_SLOW: { type: 'PROCESSING_SLOW' },
  AI_RESPONSE: { type: 'AI_RESPONSE', text: '¿Y cómo lo resolviste?' },
  FAILED: { type: 'FAILED', message: 'timeout', recoverable: true },
  RETRY: { type: 'RETRY' },
  TURN_ABORTED: { type: 'TURN_ABORTED' },
  END: { type: 'END', reason: 'completed' },
  RESET: { type: 'RESET' },
};

/** ¿El reductor aceptó el evento? Identidad, no igualdad estructural. */
function accepted(status: InterviewStatus, eventType: InterviewEventType): boolean {
  const before = phaseOf(status);
  return interviewReducer(before, EVENTS[eventType]) !== before;
}

// ══════════════════════════════════════════════════════════════════════════════

describe('el flujo completo de una entrevista', () => {
  it('recorre idle → preparing → aiSpeaking → awaitingCandidate → listening → transcribing → processing → aiSpeaking', () => {
    let phase = initialInterviewPhase;
    expect(phase.status).toBe('idle');

    phase = interviewReducer(phase, { type: 'START' });
    expect(phase.status).toBe('preparing');

    phase = interviewReducer(phase, { type: 'OPENING_READY', text: 'Hola, soy Zara.' });
    expect(phase).toEqual({ status: 'aiSpeaking', text: 'Hola, soy Zara.' });

    phase = interviewReducer(phase, { type: 'SPEECH_ENDED' });
    expect(phase.status).toBe('awaitingCandidate');

    phase = interviewReducer(phase, { type: 'CANDIDATE_TURN_STARTED', at: 1_000 });
    expect(phase).toEqual({ status: 'listening', startedAt: 1_000 });

    phase = interviewReducer(phase, { type: 'CANDIDATE_TURN_SUBMITTED' });
    expect(phase.status).toBe('transcribing');

    phase = interviewReducer(phase, { type: 'TRANSCRIPTION_SETTLED', at: 2_000 });
    expect(phase).toEqual({ status: 'processing', startedAt: 2_000, slow: false });

    phase = interviewReducer(phase, { type: 'AI_RESPONSE', text: '¿Y cómo lo resolviste?' });
    expect(phase).toEqual({ status: 'aiSpeaking', text: '¿Y cómo lo resolviste?' });
  });

  it('cierra la entrevista cuando Zara emite el fin', () => {
    let phase: InterviewTurnState = { status: 'aiSpeaking', text: 'Gracias por tu tiempo.' };

    phase = interviewReducer(phase, { type: 'SPEECH_ENDED' });
    phase = interviewReducer(phase, { type: 'END', reason: 'completed' });

    expect(phase).toEqual({ status: 'finished', reason: 'completed' });
  });

  it('permite la transición de tema sin turno del candidato', () => {
    // Zara emite el enlace al tema siguiente y continúa hablando: es un `SPEECH_STARTED`
    // desde `awaitingCandidate`, sin que el candidato haya pulsado nada.
    const phase = interviewReducer(
      { status: 'awaitingCandidate' },
      { type: 'SPEECH_STARTED', text: 'Pasemos ahora a hablar de arquitectura.' },
    );

    expect(phase).toEqual({ status: 'aiSpeaking', text: 'Pasemos ahora a hablar de arquitectura.' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('secuencias REALES de despacho de InterviewRoom', () => {
  /**
   * Reproduce una secuencia y devuelve el estado final más los eventos RECHAZADOS.
   *
   * POR QUÉ ESTE BLOQUE EXISTE
   * --------------------------
   * Las pruebas de arriba comprueban transiciones sueltas, y con todas ellas en verde la
   * máquina tenía una regresión crítica: los caminos de `handleCandidateUtterance` que
   * responden SIN consultar al modelo llamaban a `speakText()` antes de despachar
   * `TRANSCRIPTION_SETTLED`, así que el `SPEECH_STARTED` se rechazaba y la entrevista quedaba
   * atascada en `transcribing` — botón deshabilitado, sesión perdida.
   *
   * Lo encontró una revisión independiente leyendo el componente, no las pruebas. La lección
   * es que probar transiciones sueltas no prueba las SECUENCIAS, así que este bloque reproduce
   * las secuencias que el componente despacha de verdad, en su orden real.
   *
   * Un evento rechazado a mitad de una secuencia legítima es el síntoma exacto del atasco, así
   * que la aserción es que la lista de rechazos esté VACÍA.
   */
  function replay(events: readonly InterviewEvent[]): {
    final: InterviewTurnState;
    rejected: InterviewEventType[];
  } {
    let phase = initialInterviewPhase;
    const rejected: InterviewEventType[] = [];

    for (const event of events) {
      const next = interviewReducer(phase, event);
      if (next === phase) rejected.push(event.type);
      phase = next;
    }

    return { final: phase, rejected };
  }

  it('turno normal: el candidato responde y Zara pregunta lo siguiente', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Hola, soy Zara. ¿Tu experiencia con React?' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_SETTLED', at: 2_000 },
      { type: 'AI_RESPONSE', text: '¿Y cómo resolviste el problema de rendimiento?' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('REFORMULACIÓN: el candidato dice «¿cómo?» y Zara repite sin llamar al modelo', () => {
    // Es la secuencia exacta que estaba rota. `handleCandidateUtterance` detecta un fragmento
    // confuso y llama a `speakText()` DIRECTAMENTE, sin despachar `TRANSCRIPTION_SETTLED`.
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Cuéntame sobre tu experiencia.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      // Sin `TRANSCRIPTION_SETTLED`: no se envía nada al modelo.
      { type: 'SPEECH_STARTED', text: 'Perdona, lo pregunto de otra forma: ¿en qué has trabajado?' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    // Y lo que importa: el candidato PUEDE volver a hablar.
    expect(final.status).toBe('awaitingCandidate');
  });

  it('CALLEJÓN SIN SALIDA: dos respuestas evasivas y Zara cambia de tema', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta uno.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_SETTLED', at: 2_000 },
      { type: 'AI_RESPONSE', text: 'Pregunta dos.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 3_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      // Segunda evasiva: se cambia de tema sin consultar al modelo.
      { type: 'SPEECH_STARTED', text: 'Pasemos a hablar de trabajo en equipo.' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('la transcripción no captó nada: el turno vuelve al candidato', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_EMPTY' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('el saludo falla y se usa el de respaldo', () => {
    // `startInterview` habla un saludo fijo cuando la llamada al modelo falla, sin pasar por
    // `OPENING_READY`.
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'SPEECH_STARTED', text: 'Hola, empecemos la entrevista.' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('la llamada al modelo falla y Zara dice el mensaje de error', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_SETTLED', at: 2_000 },
      { type: 'PROCESSING_SLOW' },
      // El `catch` del manejador habla el mensaje de error.
      { type: 'SPEECH_STARTED', text: 'Disculpa, tuve un problema. ¿Puedes repetir?' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('el límite de preguntas del tema fuerza el avance', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Última pregunta del tema.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_SETTLED', at: 2_000 },
      // Presupuesto agotado: se habla la transición desde `processing`.
      { type: 'SPEECH_STARTED', text: 'Buena respuesta. Pasemos al siguiente tema.' },
      { type: 'SPEECH_ENDED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('el candidato termina anticipadamente en medio de un turno', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'END', reason: 'candidate-ended' },
    ]);

    expect(rejected).toEqual([]);
    expect(final).toEqual({ status: 'finished', reason: 'candidate-ended' });
  });

  it('el reloj cierra la entrevista mientras Zara habla', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Cierre por tiempo.' },
      { type: 'END', reason: 'time-exhausted' },
    ]);

    expect(rejected).toEqual([]);
    expect(final).toEqual({ status: 'finished', reason: 'time-exhausted' });
  });

  it('la red de seguridad del finally desatasca un turno abandonado', () => {
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      // El manejador falla antes de hablar y el `finally` despacha esto.
      { type: 'TURN_ABORTED' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });

  it('DOS despachos consecutivos en el mismo turno del bucle de eventos', () => {
    // `finishCandidateTurn` despacha `CANDIDATE_TURN_SUBMITTED` y `completeCandidateTurn` puede
    // despachar `TRANSCRIPTION_EMPTY` inmediatamente después, sin renderizado entre medias.
    //
    // Es el caso que obligó a que el despachador del componente actualice su ref de forma
    // SÍNCRONA: leyendo el ref del efecto, el segundo evento se comparaba contra un estado
    // obsoleto y se rechazaba siendo válido.
    const { final, rejected } = replay([
      { type: 'START' },
      { type: 'OPENING_READY', text: 'Pregunta.' },
      { type: 'SPEECH_ENDED' },
      { type: 'CANDIDATE_TURN_STARTED', at: 1_000 },
      { type: 'CANDIDATE_TURN_SUBMITTED' },
      { type: 'TRANSCRIPTION_EMPTY' },
    ]);

    expect(rejected).toEqual([]);
    expect(final.status).toBe('awaitingCandidate');
  });
});

describe('las once combinaciones imposibles dejan de ser alcanzables', () => {
  it('RECHAZA que el candidato hable mientras Zara habla', () => {
    // ESTE es el fallo central que la máquina elimina.
    //
    // Con booleanos, pulsar «hablar» durante la locución ponía `isRecording = true` sin
    // tocar `isAiSpeaking`: micrófono abierto con el altavoz sonando. El reconocedor
    // transcribía la voz de Zara y esa transcripción se enviaba al modelo como si la
    // hubiera dicho el candidato.
    const speaking: InterviewTurnState = { status: 'aiSpeaking', text: 'Cuéntame sobre React.' };

    const after = interviewReducer(speaking, { type: 'CANDIDATE_TURN_STARTED', at: 500 });

    expect(after).toBe(speaking);
  });

  it('RECHAZA abrir el micrófono mientras se procesa la respuesta', () => {
    // Con booleanos, `isProcessing && isRecording` significaba que lo que el candidato
    // dijera durante la espera se perdía: el buffer ya se había enviado.
    const processing: InterviewTurnState = { status: 'processing', startedAt: 0, slow: false };

    expect(interviewReducer(processing, { type: 'CANDIDATE_TURN_STARTED', at: 1 })).toBe(processing);
  });

  it('RECHAZA abrir el micrófono mientras se transcribe', () => {
    const transcribing: InterviewTurnState = { status: 'transcribing' };

    expect(interviewReducer(transcribing, { type: 'CANDIDATE_TURN_STARTED', at: 1 })).toBe(
      transcribing,
    );
  });

  it('RECHAZA abrir el micrófono antes de que Zara haya saludado', () => {
    // `preparing` existe precisamente por esto: antes era «los cuatro booleanos en false»,
    // indistinguible de `awaitingCandidate`, así que el botón salía habilitado y un clic
    // temprano iniciaba el turno del candidato antes del saludo.
    const preparing: InterviewTurnState = { status: 'preparing' };

    expect(interviewReducer(preparing, { type: 'CANDIDATE_TURN_STARTED', at: 1 })).toBe(preparing);
  });

  it('RECHAZA enviar una respuesta que no se estaba grabando', () => {
    for (const status of ['awaitingCandidate', 'aiSpeaking', 'processing', 'transcribing'] as const) {
      const before = phaseOf(status);
      expect(interviewReducer(before, { type: 'CANDIDATE_TURN_SUBMITTED' })).toBe(before);
    }
  });

  it('RECHAZA una respuesta del modelo cuando no se pidió ninguna', () => {
    // Una respuesta tardía de un turno abortado no debe hacer hablar a Zara.
    for (const status of ['idle', 'awaitingCandidate', 'listening', 'finished'] as const) {
      const before = phaseOf(status);
      expect(interviewReducer(before, { type: 'AI_RESPONSE', text: 'tarde' })).toBe(before);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('matriz completa de estado × evento', () => {
  /**
   * Transiciones aceptadas, declaradas por estado.
   *
   * La tabla se escribe a mano a propósito: si se derivara del reductor comprobaría que el
   * código hace lo que hace, que no es nada. Escrita aparte, un cambio en el reductor que no
   * se pretendía rompe una prueba.
   */
  const EXPECTED_ACCEPTED: Record<InterviewStatus, readonly InterviewEventType[]> = {
    // Ni `END` ni `FAILED`: antes de empezar no hay entrevista que terminar ni que pueda
    // fallar. La denegación de permisos de cámara la gestiona la pantalla previa con su
    // propio estado de error, que además ofrece reintentar.
    idle: ['START', 'RESET'],
    // Desde `preparing` el saludo entra por tres caminos: `OPENING_READY` (el normal),
    // `AI_RESPONSE` (la ruta compartida con los turnos) y `SPEECH_STARTED` (el saludo de
    // respaldo cuando la llamada al modelo falla).
    preparing: ['OPENING_READY', 'AI_RESPONSE', 'SPEECH_STARTED', 'FAILED', 'END', 'RESET'],
    aiSpeaking: ['SPEECH_ENDED', 'SPEECH_STARTED', 'FAILED', 'END', 'RESET'],
    awaitingCandidate: ['CANDIDATE_TURN_STARTED', 'SPEECH_STARTED', 'FAILED', 'END', 'RESET'],
    listening: ['CANDIDATE_TURN_SUBMITTED', 'TURN_ABORTED', 'FAILED', 'END', 'RESET'],
    // `SPEECH_STARTED` desde `transcribing`: Zara responde sin consultar al modelo. Son los
    // caminos de reformulación y de callejón sin salida. Ver el comentario en el reductor.
    transcribing: ['TRANSCRIPTION_SETTLED', 'TRANSCRIPTION_EMPTY', 'TURN_ABORTED', 'SPEECH_STARTED', 'FAILED', 'END', 'RESET'],
    processing: ['AI_RESPONSE', 'SPEECH_STARTED', 'PROCESSING_SLOW', 'TURN_ABORTED', 'FAILED', 'END', 'RESET'],
    // Terminal: solo se puede empezar de nuevo.
    finished: ['RESET'],
    failed: ['RETRY', 'FAILED', 'END', 'RESET'],
  };

  for (const status of ALL_STATUSES) {
    const expected = EXPECTED_ACCEPTED[status];

    it(`desde '${status}' acepta exactamente ${expected.length} evento(s)`, () => {
      const actual = (Object.keys(EVENTS) as InterviewEventType[]).filter((eventType) =>
        accepted(status, eventType),
      );

      expect(actual.sort()).toEqual([...expected].sort());
    });
  }

  it('cubre todos los estados y todos los eventos', () => {
    // Guarda contra la propia matriz: si se añade un estado o un evento a la máquina y no
    // aquí, esta prueba lo señala en vez de dejar la combinación nueva sin comprobar.
    expect(Object.keys(EXPECTED_ACCEPTED).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(EVENTS)).toHaveLength(15);
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('fallos', () => {
  it('un fallo recuperable deja la entrevista reintentable', () => {
    const phase = interviewReducer(
      { status: 'processing', startedAt: 0, slow: false },
      { type: 'FAILED', message: 'timeout de red', recoverable: true },
    );

    expect(phase).toEqual({ status: 'failed', message: 'timeout de red', recoverable: true });
  });

  it('RETRY devuelve el turno al candidato', () => {
    const phase = interviewReducer(
      { status: 'failed', message: 'timeout', recoverable: true },
      { type: 'RETRY' },
    );

    // Vuelve a `awaitingCandidate` y no a `listening`: reabrir el micrófono por su cuenta
    // grabaría al candidato sin que él lo haya pedido.
    expect(phase.status).toBe('awaitingCandidate');
  });

  it('un fallo NO recuperable termina la entrevista en lugar de dejarla muerta', () => {
    const phase = interviewReducer(
      { status: 'preparing' },
      { type: 'FAILED', message: 'permisos denegados', recoverable: false },
    );

    // Sin esto el candidato se queda mirando una pantalla de la que no se puede salir, sin
    // saber que tiene que contactar al reclutador.
    expect(phase).toEqual({ status: 'finished', reason: 'failed' });
  });

  it('RECHAZA un fallo antes de empezar', () => {
    const idle: InterviewTurnState = { status: 'idle' };

    // La denegación de permisos ocurre aquí, y NO es un fallo de la entrevista: es de la
    // pantalla previa, que tiene su propio estado de error y ofrece reintentar. Aceptarlo
    // obligaría a inventar un estado «falló antes de existir».
    expect(interviewReducer(idle, { type: 'FAILED', message: 'permisos', recoverable: false })).toBe(idle);
  });

  it('RECHAZA terminar una entrevista que no empezó', () => {
    const idle: InterviewTurnState = { status: 'idle' };

    // `finished` es lo que dispara el guardado del resultado y la subida del vídeo, así que
    // alcanzarlo desde `idle` crearía el registro de una sesión que nunca ocurrió.
    expect(interviewReducer(idle, { type: 'END', reason: 'candidate-ended' })).toBe(idle);
  });

  it('un fallo después de terminar no cambia nada', () => {
    const finished: InterviewTurnState = { status: 'finished', reason: 'completed' };

    // El resultado ya se guardó; un fallo tardío de una petición en vuelo no debe alterarlo.
    expect(
      interviewReducer(finished, { type: 'FAILED', message: 'x', recoverable: true }),
    ).toBe(finished);
  });

  it('se puede fallar desde un fallo, actualizando el mensaje', () => {
    const first: InterviewTurnState = { status: 'failed', message: 'primero', recoverable: true };

    const second = interviewReducer(first, {
      type: 'FAILED',
      message: 'segundo',
      recoverable: true,
    });

    expect(second).toEqual({ status: 'failed', message: 'segundo', recoverable: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('fin de la entrevista', () => {
  it('acepta END desde cualquier estado activo, con su motivo', () => {
    for (const status of ['preparing', 'aiSpeaking', 'awaitingCandidate', 'listening', 'transcribing', 'processing'] as const) {
      const phase = interviewReducer(phaseOf(status), {
        type: 'END',
        reason: 'candidate-ended',
      });

      // El candidato puede pulsar «terminar» en cualquier momento.
      expect(phase).toEqual({ status: 'finished', reason: 'candidate-ended' });
    }
  });

  it('conserva el motivo del PRIMER cierre', () => {
    const finished = interviewReducer(
      { status: 'aiSpeaking', text: 'Gracias.' },
      { type: 'END', reason: 'completed' },
    );

    const again = interviewReducer(finished, { type: 'END', reason: 'candidate-ended' });

    // Sobrescribirlo falsearía el informe: diría que el candidato la cortó cuando en
    // realidad se completó.
    expect(again).toBe(finished);
    expect(finished).toEqual({ status: 'finished', reason: 'completed' });
  });

  it('RESET vuelve al inicio desde cualquier estado', () => {
    for (const status of ALL_STATUSES) {
      expect(interviewReducer(phaseOf(status), { type: 'RESET' })).toEqual(initialInterviewPhase);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('Zara responde sin consultar al modelo', () => {
  it('permite hablar directamente desde transcribing', () => {
    // REGRESIÓN que encontró una revisión independiente. `handleCandidateUtterance` tiene tres
    // caminos que responden sin llamar al modelo —reformular cuando el candidato no entendió,
    // y las dos ramas del callejón sin salida— y los tres llaman a `speakText()` antes de
    // despachar `TRANSCRIPTION_SETTLED`.
    //
    // Sin esta transición el evento se rechazaba, el estado quedaba en `transcribing` para
    // siempre y el botón de hablar deshabilitado: el candidato perdía la entrevista por haber
    // dicho «¿cómo?».
    const phase = interviewReducer(
      { status: 'transcribing' },
      { type: 'SPEECH_STARTED', text: '¿Podrías contarme un ejemplo concreto?' },
    );

    expect(phase).toEqual({
      status: 'aiSpeaking',
      text: '¿Podrías contarme un ejemplo concreto?',
    });
  });

  it('y desde ahí vuelve al candidato al terminar de hablar', () => {
    let phase: InterviewTurnState = { status: 'transcribing' };
    phase = interviewReducer(phase, { type: 'SPEECH_STARTED', text: 'Reformulo la pregunta.' });
    phase = interviewReducer(phase, { type: 'SPEECH_ENDED' });

    // El camino completo tiene que devolver el control, no solo salir de `transcribing`.
    expect(phase.status).toBe('awaitingCandidate');
  });
});

describe('turno abandonado', () => {
  it('devuelve el control al candidato desde los tres estados intermedios', () => {
    for (const status of ['listening', 'transcribing', 'processing'] as const) {
      const phase = interviewReducer(phaseOf(status), { type: 'TURN_ABORTED' });
      expect(phase.status).toBe('awaitingCandidate');
    }
  });

  it('es un no-op en el camino normal', () => {
    // Se despacha en el `finally` de `handleCandidateUtterance`, cuando el camino normal ya
    // devolvió el estado a `awaitingCandidate` o `aiSpeaking`. Ahí no debe hacer nada.
    for (const status of ['awaitingCandidate', 'aiSpeaking'] as const) {
      const before = phaseOf(status);
      expect(interviewReducer(before, { type: 'TURN_ABORTED' })).toBe(before);
    }
  });
});

describe('espera larga del modelo', () => {
  it('marca la espera como lenta sin cambiar de estado', () => {
    const phase = interviewReducer(
      { status: 'processing', startedAt: 100, slow: false },
      { type: 'PROCESSING_SLOW' },
    );

    expect(phase).toEqual({ status: 'processing', startedAt: 100, slow: true });
  });

  it('PROCESSING_SLOW es idempotente', () => {
    const slow: InterviewTurnState = { status: 'processing', startedAt: 100, slow: true };

    // El temporizador puede disparar más de una vez; crear un objeto nuevo provocaría un
    // renderizado por nada.
    expect(interviewReducer(slow, { type: 'PROCESSING_SLOW' })).toBe(slow);
  });

  it('la respuesta que llega tras marcarse lenta sigue siendo válida', () => {
    let phase: InterviewTurnState = { status: 'processing', startedAt: 0, slow: false };
    phase = interviewReducer(phase, { type: 'PROCESSING_SLOW' });
    phase = interviewReducer(phase, { type: 'AI_RESPONSE', text: 'Perdona la espera.' });

    expect(phase).toEqual({ status: 'aiSpeaking', text: 'Perdona la espera.' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('deriveInterviewFlags', () => {
  it('produce exactamente UNA bandera de actividad por estado', () => {
    const activityFlags = (
      ['isPreparing', 'isAiSpeaking', 'isRecording', 'isTranscribing', 'isProcessing', 'isFinished', 'isFailed'] as const
    );

    for (const status of ALL_STATUSES) {
      const flags = deriveInterviewFlags(phaseOf(status));
      const active = activityFlags.filter((flag) => flags[flag]);

      // Es la propiedad que los cuatro booleanos independientes NO garantizaban: nunca dos
      // a la vez, y nunca cero salvo en reposo.
      if (status === 'idle' || status === 'awaitingCandidate') {
        expect(active).toEqual([]);
      } else {
        expect(active).toHaveLength(1);
      }
    }
  });

  it('habilita el botón de hablar solo en awaitingCandidate', () => {
    for (const status of ALL_STATUSES) {
      const { canStartTurn } = deriveInterviewFlags(phaseOf(status));
      expect(canStartTurn).toBe(status === 'awaitingCandidate');
    }
  });

  it('ofrece «terminar respuesta» solo mientras se graba', () => {
    for (const status of ALL_STATUSES) {
      const { canFinishTurn } = deriveInterviewFlags(phaseOf(status));
      expect(canFinishTurn).toBe(status === 'listening');
    }
  });

  it('hasStarted es falso solo en idle', () => {
    for (const status of ALL_STATUSES) {
      expect(deriveInterviewFlags(phaseOf(status)).hasStarted).toBe(status !== 'idle');
    }
  });

  it('expone el texto que Zara está diciendo, y solo entonces', () => {
    expect(deriveInterviewFlags({ status: 'aiSpeaking', text: 'Hola' }).spokenText).toBe('Hola');
    expect(deriveInterviewFlags({ status: 'awaitingCandidate' }).spokenText).toBe('');
  });

  it('isProcessingSlow solo con la espera marcada', () => {
    expect(deriveInterviewFlags({ status: 'processing', startedAt: 0, slow: false }).isProcessingSlow).toBe(false);
    expect(deriveInterviewFlags({ status: 'processing', startedAt: 0, slow: true }).isProcessingSlow).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('isInterviewActive', () => {
  it('distingue los estados en curso de los terminales y el reposo', () => {
    const active: readonly InterviewStatus[] = [
      'preparing',
      'aiSpeaking',
      'awaitingCandidate',
      'listening',
      'transcribing',
      'processing',
    ];

    for (const status of ALL_STATUSES) {
      expect(isInterviewActive(phaseOf(status))).toBe(active.includes(status));
    }
  });
});

describe('describeRejectedEvent', () => {
  it('nombra el evento y el estado en que se rechazó', () => {
    const message = describeRejectedEvent(
      { status: 'aiSpeaking', text: 'x' },
      { type: 'CANDIDATE_TURN_STARTED', at: 0 },
    );

    // Registrar el rechazo es lo que convierte la carrera invisible en una línea con la que
    // se puede depurar la queja de un candidato.
    expect(message).toContain('CANDIDATE_TURN_STARTED');
    expect(message).toContain('aiSpeaking');
  });
});
