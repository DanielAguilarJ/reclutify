type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

/**
 * Idiomas que soporta el producto, con su etiqueta BCP 47.
 *
 * Se declara aquí y no se pasa la etiqueta cruda para que un idioma nuevo obligue a
 * tocar este mapa en vez de a acordarse de pasar la cadena correcta en cada llamada.
 */
const RECOGNITION_LANGS = { es: 'es-ES', en: 'en-US' } as const;

export type SpeechToTextLanguage = keyof typeof RECOGNITION_LANGS;

export class SpeechToText {
  private recognition: ReturnType<typeof this.createRecognition> | null = null;
  private isListening = false;

  /**
   * Idioma del reconocimiento.
   *
   * ESTO ERA UN BUG, NO UNA FALTA DE CONFIGURABILIDAD
   * -------------------------------------------------
   * La clase fijaba `recognition.lang = 'en-US'` sin ningún parámetro. Reclutify es un
   * producto cuyo idioma principal es el español —el diccionario por defecto es `es`, la
   * landing está en español y los clientes están en LATAM y España— así que TODOS los
   * candidatos hispanohablantes se transcribían con el modelo acústico inglés.
   *
   * El efecto no es un error visible: es una transcripción degradada. Y esa
   * transcripción es la entrada de `/api/evaluate`, así que la evaluación del candidato
   * se calculaba sobre un texto peor de lo que debía.
   *
   * Por defecto `es`, que es el idioma por defecto del producto.
   */
  constructor(private language: SpeechToTextLanguage = 'es') {}

  /** Cambia el idioma. El cambio surte efecto en el siguiente `start()`. */
  setLanguage(language: SpeechToTextLanguage): void {
    this.language = language;
  }
  public onResult: ((text: string) => void) | null = null;
  public onInterim: ((text: string) => void) | null = null;
  public onEnd: (() => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  private createRecognition() {
    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition })
        .SpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech recognition is not supported in this browser');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = RECOGNITION_LANGS[this.language];

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript && this.onResult) {
        this.onResult(finalTranscript);
      }
      if (interimTranscript && this.onInterim) {
        this.onInterim(interimTranscript);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== 'no-speech' && this.onError) {
        this.onError(event.error);
      }
    };

    recognition.onend = () => {
      if (this.isListening) {
        // Auto-restart if we're supposed to be listening
        try {
          recognition.start();
        } catch {
          this.isListening = false;
          this.onEnd?.();
        }
      } else {
        this.onEnd?.();
      }
    };

    return recognition;
  }

  start() {
    if (this.isListening) return;
    try {
      this.recognition = this.createRecognition();
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      console.error('Failed to start STT:', error);
      this.onError?.('Failed to start speech recognition');
    }
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  get listening() {
    return this.isListening;
  }
}
