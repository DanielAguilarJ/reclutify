interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Ampliación del `Window` del entorno.
 *
 * QUÉ ESTABA MAL
 * --------------
 * Las dos propiedades estaban declaradas como OBLIGATORIAS. `window.SpeechRecognition`
 * no existe en todos los navegadores —Safari solo expone la variante `webkit`— y el
 * código ya comprueba su presencia antes de usarlas. Declararlas obligatorias hacía
 * que TypeScript diera por buena una comprobación que sí es necesaria, así que el
 * tipo describía un navegador que no existe.
 *
 * Con `?` la comprobación pasa a ser exigida por el compilador, que es lo que
 * permite retirar los `(window as any)` repartidos por `HardwareCheck` e
 * `InterviewRoom`.
 *
 * Va a nivel superior y NO dentro de `declare global`: este archivo no tiene
 * `import` ni `export`, así que TypeScript lo trata como script global y las
 * interfaces de nivel superior se fusionan con las de `lib.dom`. Un `declare global`
 * aquí solo es válido dentro de un módulo.
 */
interface Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}
