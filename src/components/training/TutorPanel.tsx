'use client';

/**
 * Tutor IA en panel acoplado y colapsable.
 *
 * ── Decisión de diseño ────────────────────────────────────────────────────────
 *
 * Era una burbuja flotante que abría una ventana de 360x480 sobre la esquina
 * inferior derecha, es decir, encima del contenido que el empleado estaba
 * leyendo. Preguntarle al tutor obligaba a tapar el material sobre el que se
 * preguntaba.
 *
 * Aquí el tutor es un bloque más de la columna: se colapsa y se expande con un
 * `<button aria-expanded>` y convive con la lectura en vez de solaparla. El
 * historial es un `role="log"` con `aria-live="polite"`, para que las respuestas
 * se anuncien sin robar el foco.
 *
 * El borrador NO se limpia si el envío falla: el texto se queda en el campo y
 * reenviar es una pulsación, sin necesidad de un botón de reintento aparte.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, FileText, Send, Sparkles } from 'lucide-react';
import type { TrainingMessage } from '@/types';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import { focusRing } from './ui';

interface TutorPanelProps {
  language: TrainingContentLanguage;
  title: string;
  messages: TrainingMessage[];
  aiSpeaking: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Debe rechazar si el envío falla: el panel conserva el borrador. */
  onSend: (message: string) => Promise<void>;
  placeholder: string;
  emptyHint: string;
  errorMessage?: string | null;
}

export function TutorPanel({
  language,
  title,
  messages,
  aiSpeaking,
  open,
  onOpenChange,
  onSend,
  placeholder,
  emptyHint,
  errorMessage,
}: TutorPanelProps) {
  const copy = getTrainingCopy(language).center.tutor;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bodyId = useId();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // `scrollIntoView` no existe en jsdom: la guarda evita romper las pruebas
    // de la pantalla sin necesidad de simular el DOM.
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [messages, open, aiSpeaking]);

  const handleSend = async () => {
    const message = draft.trim();

    if (!message || aiSpeaking || sending) return;

    setSending(true);

    try {
      await onSend(message);
      setDraft('');
    } catch {
      // La pantalla es la que decide cómo comunicar el fallo; el panel solo
      // se asegura de no perder lo que la persona escribió.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const disabled = aiSpeaking || sending;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <h2>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-card-hover ${focusRing}`}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted">
            {open ? copy.close : copy.open}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </h2>

      <div id={bodyId} hidden={!open}>
        <div className="border-t border-border px-4 py-4">
          <div
            role="log"
            aria-live="polite"
            aria-label={copy.logLabel}
            className="max-h-80 space-y-3 overflow-y-auto"
          >
            {messages.length === 0 ? (
              <p className="py-2 text-sm text-muted">{emptyHint}</p>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === 'user'
                    ? 'flex justify-end'
                    : 'flex justify-start'
                }
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-accent-soft text-foreground'
                      : 'border border-border bg-surface text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.sources}
                      </p>
                      {message.citations.map((citation, citationIndex) => (
                        <p
                          key={citationIndex}
                          className="rounded-md bg-background px-2.5 py-1.5 text-xs text-foreground/75"
                        >
                          <span className="font-medium text-foreground">
                            {citation.fileName}
                          </span>
                          {citation.snippet ? `: ${citation.snippet}` : null}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {aiSpeaking ? (
              <p className="text-xs text-muted">{copy.thinking}…</p>
            ) : null}

            <div ref={endRef} />
          </div>

          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <label className="sr-only" htmlFor={`${bodyId}-input`}>
              {placeholder}
            </label>
            <input
              id={`${bodyId}-input`}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={`min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted disabled:opacity-60 ${focusRing}`}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={disabled || draft.trim().length === 0}
              aria-label={copy.send}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
