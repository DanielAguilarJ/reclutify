export class TextToSpeech {
  private utterance: SpeechSynthesisUtterance | null = null;
  public onStart: (() => void) | null = null;
  public onEnd: (() => void) | null = null;
  public onWord: ((charIndex: number) => void) | null = null;

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to pick a good English voice
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Samantha') ||
            v.name.includes('Google') ||
            v.name.includes('Microsoft'))
      );
      if (preferred) {
        utterance.voice = preferred;
      } else {
        const english = voices.find((v) => v.lang.startsWith('en'));
        if (english) utterance.voice = english;
      }

      utterance.onstart = () => {
        this.onStart?.();
      };

      utterance.onend = () => {
        this.onEnd?.();
        resolve();
      };

      utterance.onerror = () => {
        this.onEnd?.();
        resolve();
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          this.onWord?.(event.charIndex);
        }
      };

      this.utterance = utterance;
      speechSynthesis.speak(utterance);
    });
  }

  stop() {
    speechSynthesis.cancel();
    this.utterance = null;
  }

  get speaking() {
    return speechSynthesis.speaking;
  }
}
