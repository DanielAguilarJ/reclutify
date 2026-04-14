type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

export class SpeechToText {
  private recognition: ReturnType<typeof this.createRecognition> | null = null;
  private isListening = false;
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
    recognition.lang = 'en-US';

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
