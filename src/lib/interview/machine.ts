/**
 * Máquina de estados de la sala de entrevista.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EL PROBLEMA QUE RESUELVE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `InterviewRoom` representaba el estado de la entrevista con CUATRO booleanos
 * independientes —`isAiSpeaking`, `isRecording`, `isProcessing`, `isTranscribing`— más
 * `hasStarted`. Cuatro booleanos son dieciséis combinaciones, y solo cinco significan algo.
 * Las otras once son estados que el producto no tiene pero el código sí puede alcanzar:
 *
 *   isAiSpeaking && isRecording   → Zara habla con el micrófono del candidato abierto.
 *                                    Lo que oye el modelo en el turno siguiente es la voz
 *                                    de Zara transcrita como si la hubiera dicho el
 *                                    candidato.
 *   isProcessing && isRecording   → se envía la respuesta mientras se sigue grabando, así
 *                                    que lo que el candidato diga después se pierde.
 *   isTranscribing && isAiSpeaking → dos fuentes escribiendo el mismo buffer.
 *
 * Y las transiciones estaban escritas como PARES DE ASIGNACIONES repartidos por 2 190
 * líneas:
 *
 *     setIsRecording(false); setIsProcessing(true);    // línea 640
 *     setIsRecording(false); setIsAiSpeaking(true);    // línea 1353
 *     setIsAiSpeaking(false); ... setIsRecording(false); // líneas 1383-1387
 *
 * Cada par es una transición. Escrita así, nada garantiza que las dos asignaciones ocurran
 * juntas, ni que el estado de partida fuera el correcto: entre la primera y la segunda hay
 * un renderizado en el que la interfaz muestra una combinación imposible, y si un camino
 * olvida una de las dos el estado queda inconsistente para siempre.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * QUÉ CAMBIA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Un solo valor con forma de unión discriminada. Las once combinaciones imposibles dejan de
 * ser representables: no hay forma de escribir un estado en el que Zara hable y el
 * micrófono esté abierto, porque son dos miembros distintos de la misma unión.
 *
 * Las transiciones pasan a ser una tabla explícita. Un evento que no corresponde al estado
 * actual **se rechaza**, y el rechazo es observable: es lo que convierte «el candidato pulsó
 * hablar mientras Zara hablaba» de una carrera silenciosa en una decisión registrada.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ES UN REDUCTOR PURO Y NO UN HOOK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Este archivo no importa React, ni toca el DOM, ni conoce `fetch`. Recibe un estado y un
 * evento y devuelve un estado. Eso permite comprobar las cincuenta y tantas transiciones
 * —incluidos los rechazos— con una tabla de casos, sin montar el componente, sin simular
 * OpenRouter y sin `MediaStream`.
 *
 * Los efectos (TTS, reconocimiento de voz, grabación, llamada al modelo) siguen donde
 * están y se limitan a despachar eventos. Separar la DECISIÓN del EFECTO es lo que hace
 * probable la parte difícil.
 */

// ══════════════════════════════════════════════════════════════════════════════
// Estados
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fase de la entrevista. Los ocho miembros son mutuamente excluyentes por construcción.
 *
 * El orden de declaración sigue el flujo real de una entrevista, que es como se lee mejor:
 * `idle` → `preparing` → `aiSpeaking` → `awaitingCandidate` → `listening` →
 * `transcribing` → `processing` → (vuelta a `aiSpeaking`) … → `finished`.
 */
/**
 * Estado del TURNO de conversación. No confundir con las otras dos «fases» del dominio.
 *
 * En este proyecto conviven tres conceptos con ese nombre, y se llegó a tener dos tipos exportados
 * llamados `InterviewPhase` con significados distintos:
 *
 *  - `InterviewPhase` de `@/types`: por dónde va la PÁGINA del candidato —`details`, `overview`,
 *    `hardware`, `interview`, `complete`—. Lo usa `interviewStore`.
 *  - `InterviewPhaseKind` de `zara-prompt`: qué le toca hacer al MODELO en este turno.
 *  - este tipo: quién tiene la palabra AHORA MISMO dentro de la sala.
 *
 * Son ortogonales: se puede estar en la fase `interview` de la página, con el modelo en fase de
 * cierre, y con el turno en `listening`. El compilador cazaría un cambiazo entre ellos porque las
 * formas no encajan, pero el lector no tiene por qué pelearse con eso, así que este se llama
 * `InterviewTurnState`.
 */
export type InterviewTurnState =
  /** Antes de empezar. El candidato está en la pantalla previa. */
  | { readonly status: 'idle' }
  /**
   * Permisos de cámara y micrófono concedidos y saludo de apertura en camino.
   *
   * Existe como estado propio porque dura segundos y durante ellos la interfaz no debe
   * ofrecer el botón de hablar: antes ese intervalo era «los cuatro booleanos en false»,
   * indistinguible de `awaitingCandidate`, así que el botón aparecía habilitado y un clic
   * temprano iniciaba un turno del candidato antes de que Zara hubiera saludado.
   */
  | { readonly status: 'preparing' }
  /** Zara habla. El micrófono está cerrado. */
  | { readonly status: 'aiSpeaking'; readonly text: string }
  /** Zara terminó. El botón de hablar está habilitado y el candidato decide cuándo. */
  | { readonly status: 'awaitingCandidate' }
  /** El micrófono está abierto. Zara está callada. */
  | { readonly status: 'listening'; readonly startedAt: number }
  /**
   * El candidato terminó de hablar y se espera el último fragmento del reconocedor.
   *
   * El reconocimiento de voz del navegador entrega el texto definitivo con retraso, así que
   * cerrar el micrófono y enviar de inmediato corta la última frase.
   */
  | { readonly status: 'transcribing' }
  /**
   * La respuesta está en camino al modelo.
   *
   * `slow` no es un estado aparte: es la misma espera pasada de tiempo. Como estado
   * separado obligaría a duplicar cada transición de salida.
   */
  | { readonly status: 'processing'; readonly startedAt: number; readonly slow: boolean }
  /** La entrevista terminó, por cierre normal o porque el candidato la cortó. */
  | { readonly status: 'finished'; readonly reason: InterviewEndReason }
  /**
   * Fallo que impide continuar.
   *
   * `recoverable` distingue «reintenta el turno» de «la entrevista se acabó»: un fallo de
   * red en un turno se recupera, la denegación de permisos de cámara no.
   */
  | { readonly status: 'failed'; readonly message: string; readonly recoverable: boolean };

/** Por qué terminó la entrevista. Va al informe, así que se distingue. */
export type InterviewEndReason =
  /** Zara emitió `[END_INTERVIEW]`: recorrió todos los temas. */
  | 'completed'
  /** El candidato pulsó «terminar». */
  | 'candidate-ended'
  /** Se agotó el tiempo, incluido el periodo de gracia. */
  | 'time-exhausted'
  /** Un fallo no recuperable. */
  | 'failed';

/** Nombre de cada fase, para tablas y registros. */
export type InterviewStatus = InterviewTurnState['status'];

/** Estado inicial. */
export const initialInterviewPhase: InterviewTurnState = { status: 'idle' };

// ══════════════════════════════════════════════════════════════════════════════
// Eventos
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Eventos que puede recibir la máquina.
 *
 * Los nombres describen **lo que pasó**, no lo que hay que hacer: `SPEECH_ENDED` y no
 * `enableMicrophone`. Un evento imperativo obligaría a quien lo despacha a conocer el
 * estado destino, que es exactamente la responsabilidad que se está centralizando aquí.
 */
export type InterviewEvent =
  /** El candidato pulsó «empezar» y los permisos ya se concedieron. */
  | { readonly type: 'START' }
  /** El saludo de apertura llegó y está listo para reproducirse. */
  | { readonly type: 'OPENING_READY'; readonly text: string }
  /** Empieza a reproducirse un mensaje de Zara. */
  | { readonly type: 'SPEECH_STARTED'; readonly text: string }
  /** El audio de Zara terminó, o falló y se dio por terminado. */
  | { readonly type: 'SPEECH_ENDED' }
  /** El candidato pulsó «hablar». */
  | { readonly type: 'CANDIDATE_TURN_STARTED'; readonly at: number }
  /** El candidato pulsó «terminar respuesta». */
  | { readonly type: 'CANDIDATE_TURN_SUBMITTED' }
  /** Llegó el fragmento definitivo del reconocedor; hay algo que enviar. */
  | { readonly type: 'TRANSCRIPTION_SETTLED'; readonly at: number }
  /**
   * El reconocedor no capturó nada utilizable.
   *
   * Se distingue de `TRANSCRIPTION_SETTLED` porque no hay nada que enviar al modelo: se
   * devuelve el turno al candidato en vez de gastar una llamada en una cadena vacía.
   */
  | { readonly type: 'TRANSCRIPTION_EMPTY' }
  /** La espera del modelo se pasó del umbral. Solo cambia el mensaje de la interfaz. */
  | { readonly type: 'PROCESSING_SLOW' }
  /** Llegó la respuesta del modelo. */
  | { readonly type: 'AI_RESPONSE'; readonly text: string }
  /** Un fallo. */
  | { readonly type: 'FAILED'; readonly message: string; readonly recoverable: boolean }
  /** Reintento tras un fallo recuperable. */
  | { readonly type: 'RETRY' }
  /**
   * El turno del candidato se abandonó sin producir nada.
   *
   * Es la red de seguridad de `handleCandidateUtterance`: sus caminos de salida pasan todos
   * por `speakText`, que devuelve el estado a `awaitingCandidate`, pero un camino nuevo que
   * se olvide de hacerlo dejaría la entrevista atascada en `processing` para siempre —el
   * botón de hablar deshabilitado y el candidato sin poder continuar—.
   *
   * Se despacha en el `finally` y solo surte efecto si el estado sigue en un punto
   * intermedio, así que en el camino normal es un no-op.
   */
  | { readonly type: 'TURN_ABORTED' }
  /** Fin de la entrevista. */
  | { readonly type: 'END'; readonly reason: InterviewEndReason }
  /** Vuelta al estado inicial, para una sesión nueva en la misma pestaña. */
  | { readonly type: 'RESET' };

/** Nombre de cada evento. */
export type InterviewEventType = InterviewEvent['type'];

// ══════════════════════════════════════════════════════════════════════════════
// Transiciones
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Estados desde los que la entrevista está EN CURSO.
 *
 * `END` y `FAILED` se aceptan desde todos ellos: el candidato puede pulsar «terminar» en
 * cualquier momento, y un fallo puede llegar en cualquier punto.
 */
const ACTIVE_STATUSES: readonly InterviewStatus[] = [
  'preparing',
  'aiSpeaking',
  'awaitingCandidate',
  'listening',
  'transcribing',
  'processing',
];

/** ¿La entrevista está en curso? */
export function isInterviewActive(phase: InterviewTurnState): boolean {
  return ACTIVE_STATUSES.includes(phase.status);
}

/**
 * Aplica un evento al estado.
 *
 * **Devuelve la MISMA referencia cuando el evento no corresponde al estado actual.** Eso es
 * deliberado y tiene dos efectos: `useReducer` omite el re-renderizado, y quien llama puede
 * detectar el rechazo con una comparación de identidad para registrarlo.
 *
 * @param phase Estado actual.
 * @param event Evento a aplicar.
 * @returns El estado nuevo, o `phase` sin cambios si la transición no es válida.
 */
export function interviewReducer(phase: InterviewTurnState, event: InterviewEvent): InterviewTurnState {
  // ─── Eventos aceptados desde varios estados ───
  //
  // Se resuelven antes del `switch` por estado para no repetirlos en seis ramas, que es
  // donde se olvida uno.

  if (event.type === 'RESET') {
    // Siempre válido: es la vuelta a cero de una pestaña que empieza otra entrevista.
    return initialInterviewPhase;
  }

  if (event.type === 'END') {
    // Se rechaza desde `idle` y desde `finished`, por motivos distintos:
    //
    //  - `idle`: la entrevista no ha empezado. Marcarla como terminada crearía un registro
    //    de una sesión que nunca ocurrió, y `finished` es lo que dispara el guardado del
    //    resultado y la subida del vídeo.
    //  - `finished`: terminar dos veces sobrescribiría el motivo del primer cierre, y ese
    //    motivo va al informe. Un cierre por tiempo agotado no debe acabar registrado como
    //    «el candidato la cortó».
    if (phase.status === 'idle' || phase.status === 'finished') return phase;

    return { status: 'finished', reason: event.reason };
  }

  if (event.type === 'FAILED') {
    // Desde `idle` se rechaza: antes de empezar no hay entrevista que pueda fallar.
    //
    // El caso real que parece contradecirlo es la denegación de permisos de cámara, que
    // ocurre en `startInterview` ANTES de despachar `START`. Ese fallo NO es de la
    // entrevista: es de la pantalla previa, y la pantalla previa tiene su propio estado de
    // error (`mediaError`), que además ofrece reintentar los permisos. Meterlo en la máquina
    // obligaría a inventar un estado «falló antes de existir» del que la única salida sería
    // `RESET`.
    if (phase.status === 'idle') return phase;

    // Un fallo cuando la entrevista ya terminó no cambia nada: el resultado ya se guardó, y
    // una petición en vuelo que falle después no debe alterarlo.
    if (phase.status === 'finished') return phase;

    // Un fallo NO recuperable termina la entrevista en vez de dejarla en un estado del que
    // no se puede salir. Es lo que evita que el candidato se quede mirando una pantalla
    // muerta sin saber que tiene que contactar al reclutador.
    return event.recoverable
      ? { status: 'failed', message: event.message, recoverable: true }
      : { status: 'finished', reason: 'failed' };
  }

  // ─── Transiciones por estado ───

  switch (phase.status) {
    case 'idle':
      // Lo único que puede pasar antes de empezar es empezar.
      return event.type === 'START' ? { status: 'preparing' } : phase;

    case 'preparing':
      // El saludo puede llegar como apertura o como respuesta normal: los dos caminos
      // existen porque `startInterview` pide la apertura y `handleCandidateUtterance`
      // reutiliza la misma ruta.
      if (event.type === 'OPENING_READY' || event.type === 'AI_RESPONSE') {
        return { status: 'aiSpeaking', text: event.text };
      }
      // `SPEECH_STARTED` sin haber pasado por la respuesta ocurre con el saludo de
      // respaldo, cuando la llamada al modelo falla y se usa un texto fijo.
      if (event.type === 'SPEECH_STARTED') {
        return { status: 'aiSpeaking', text: event.text };
      }
      return phase;

    case 'aiSpeaking':
      if (event.type === 'SPEECH_ENDED') return { status: 'awaitingCandidate' };
      // Un mensaje nuevo mientras habla SUSTITUYE el texto en vez de rechazarse: ocurre
      // cuando Zara reformula y `useTTS` ya cancela la locución anterior, así que el estado
      // debe reflejar lo que suena de verdad.
      if (event.type === 'SPEECH_STARTED') return { status: 'aiSpeaking', text: event.text };
      //
      // CANDIDATE_TURN_STARTED SE RECHAZA AQUÍ, Y ES EL PUNTO DE TODA LA MÁQUINA.
      //
      // Con booleanos independientes, pulsar «hablar» mientras Zara hablaba ponía
      // `isRecording = true` sin tocar `isAiSpeaking`, y el resultado era el micrófono
      // abierto con el altavoz sonando: el reconocedor transcribía la voz de Zara y esa
      // transcripción se enviaba al modelo como si la hubiera dicho el candidato.
      //
      // El componente tenía tres guardas repartidas para evitarlo (`speakingRef`,
      // `isAiSpeaking` y `candidateTurnActiveRef`) y ninguna cubría la ventana entre el
      // `setIsAiSpeaking(false)` y el renderizado siguiente. Aquí no hay ventana: el estado
      // es uno solo.
      return phase;

    case 'awaitingCandidate':
      if (event.type === 'CANDIDATE_TURN_STARTED') {
        return { status: 'listening', startedAt: event.at };
      }
      // Zara puede volver a hablar sin turno del candidato: es el caso de la transición de
      // tema, en la que emite el enlace al tema siguiente y continúa.
      if (event.type === 'SPEECH_STARTED') return { status: 'aiSpeaking', text: event.text };
      return phase;

    case 'listening':
      if (event.type === 'CANDIDATE_TURN_SUBMITTED') return { status: 'transcribing' };
      // Un turno abandonado —error fatal del reconocedor, por ejemplo— devuelve el control
      // al candidato en vez de dejar el micrófono marcado como abierto.
      if (event.type === 'TURN_ABORTED') return { status: 'awaitingCandidate' };
      return phase;

    case 'transcribing':
      if (event.type === 'TRANSCRIPTION_SETTLED') {
        return { status: 'processing', startedAt: event.at, slow: false };
      }
      // Sin nada que enviar se devuelve el turno en vez de gastar una llamada al modelo con
      // una cadena vacía, que además produciría una pregunta desconectada.
      if (event.type === 'TRANSCRIPTION_EMPTY') return { status: 'awaitingCandidate' };
      if (event.type === 'TURN_ABORTED') return { status: 'awaitingCandidate' };
      //
      // ZARA PUEDE HABLAR DIRECTAMENTE DESDE AQUÍ, SIN PASAR POR EL MODELO.
      //
      // Se me pasó al diseñar la máquina y lo encontró una revisión independiente. Es una
      // REGRESIÓN CRÍTICA, no un caso teórico: `handleCandidateUtterance` tiene tres caminos
      // que responden sin consultar al modelo —reformular una pregunta que el candidato no
      // entendió, y las dos ramas de la detección de callejón sin salida— y los tres llaman a
      // `speakText()` ANTES de despachar `TRANSCRIPTION_SETTLED`.
      //
      // Sin esta transición, ese `SPEECH_STARTED` se rechazaba, el estado se quedaba en
      // `transcribing` para siempre y el botón de hablar quedaba deshabilitado: el candidato
      // perdía la entrevista por haber dicho «¿cómo?».
      //
      // No se corrige despachando `TRANSCRIPTION_SETTLED` antes, que era la otra opción: ese
      // evento significa «hay texto que enviar al modelo», y en estos tres caminos no se
      // envía nada. Sería registrar un estado `processing` que no ocurre.
      if (event.type === 'SPEECH_STARTED') return { status: 'aiSpeaking', text: event.text };
      return phase;

    case 'processing':
      if (event.type === 'AI_RESPONSE') return { status: 'aiSpeaking', text: event.text };
      // Red de seguridad: ver el comentario de `TURN_ABORTED`.
      if (event.type === 'TURN_ABORTED') return { status: 'awaitingCandidate' };
      // El texto puede empezar a sonar antes de que el llamante despache `AI_RESPONSE`
      // (respaldo de voz nativa), así que este camino también es válido.
      if (event.type === 'SPEECH_STARTED') return { status: 'aiSpeaking', text: event.text };
      if (event.type === 'PROCESSING_SLOW') {
        // Idempotente: el temporizador puede disparar más de una vez y volver a crear el
        // objeto provocaría un re-renderizado por nada.
        return phase.slow ? phase : { ...phase, slow: true };
      }
      return phase;

    case 'failed':
      // Solo se sale reintentando. `RETRY` devuelve el turno al candidato, que es donde
      // estaba antes del fallo en el único caso recuperable que existe: un turno que no
      // llegó al modelo.
      return event.type === 'RETRY' ? { status: 'awaitingCandidate' } : phase;

    case 'finished':
      // Estado terminal. `RESET` ya se atendió arriba.
      return phase;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Valores derivados
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Banderas que consume la interfaz.
 *
 * Existen para que el JSX no cambie al adoptar la máquina: `InterviewRoom` seguía leyendo
 * `isAiSpeaking`, `isRecording`, `isProcessing` y `isTranscribing` en veinte sitios, y
 * reescribirlos todos en el mismo cambio que introduce la máquina habría mezclado dos
 * refactorizaciones distintas en un diff imposible de revisar.
 *
 * La diferencia con los booleanos anteriores es que estos son **derivados**: no se pueden
 * asignar, así que no pueden contradecirse.
 */
export interface InterviewFlags {
  hasStarted: boolean;
  isPreparing: boolean;
  isAiSpeaking: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isProcessing: boolean;
  /** La espera del modelo se pasó del umbral. */
  isProcessingSlow: boolean;
  isFinished: boolean;
  isFailed: boolean;
  /** El botón de hablar debe estar habilitado. */
  canStartTurn: boolean;
  /** El botón debe decir «terminar respuesta». */
  canFinishTurn: boolean;
  /** Texto que Zara está diciendo, o `''`. */
  spokenText: string;
}

/**
 * Deriva las banderas de la interfaz a partir de la fase.
 *
 * `canStartTurn` es la que más importa: antes era la expresión
 * `!isRecording && (isAiSpeaking || isProcessing || isTranscribing)` NEGADA e incrustada en
 * el atributo `disabled` del botón, así que la regla de cuándo puede hablar el candidato
 * vivía en el JSX. Ahora es una sola comparación con el estado.
 */
export function deriveInterviewFlags(phase: InterviewTurnState): InterviewFlags {
  return {
    hasStarted: phase.status !== 'idle',
    isPreparing: phase.status === 'preparing',
    isAiSpeaking: phase.status === 'aiSpeaking',
    isRecording: phase.status === 'listening',
    isTranscribing: phase.status === 'transcribing',
    isProcessing: phase.status === 'processing',
    isProcessingSlow: phase.status === 'processing' && phase.slow,
    isFinished: phase.status === 'finished',
    isFailed: phase.status === 'failed',
    canStartTurn: phase.status === 'awaitingCandidate',
    canFinishTurn: phase.status === 'listening',
    spokenText: phase.status === 'aiSpeaking' ? phase.text : '',
  };
}

/**
 * Describe un rechazo, para el registro.
 *
 * Se usa comparando referencias: si el reductor devolvió el mismo objeto, el evento se
 * rechazó. Registrar los rechazos es lo que convierte «el candidato pulsó hablar mientras
 * Zara hablaba» de una carrera invisible en una línea de log con la que se puede depurar
 * una queja de un candidato.
 */
export function describeRejectedEvent(
  phase: InterviewTurnState,
  event: InterviewEvent,
): string {
  return `[interview-machine] ${event.type} rechazado en estado '${phase.status}'`;
}
