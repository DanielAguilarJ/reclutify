'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useInfoSessionStore } from '@/store/infoSessionStore';
import InfoAiOrb from './InfoAiOrb';
import { TextToSpeech } from '@/lib/tts';
import { SpeechToText } from '@/lib/stt';
import type { InfoChatResponse, InfoSessionTranscriptEntry } from '@/types/informes';

export default function InfoSessionRoom() {
  const {
    sessionId,
    course,
    modules,
    plans,
    transcript,
    isSpeaking,
    isListening,
    isLoading,
    timerSeconds,
    clientName,
    clientAge,
    clientOccupation,
    courseFor,
    setIsSpeaking,
    setIsListening,
    setIsLoading,
    addTranscriptEntry,
    addObjection,
    setClosingMode,
    setCoachNotified,
    setPhase,
    syncTranscript,
  } = useInfoSessionStore();

  const [inputText, setInputText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState('Saludo');
  const [interimText, setInterimText] = useState('');

  const transcriptRef = useRef<HTMLDivElement>(null);
  const ttsRef = useRef<TextToSpeech | null>(null);
  const sttRef = useRef<SpeechToText | null>(null);
  const messageCountSinceSync = useRef(0);
  const hasGreeted = useRef(false);

  // Initialize TTS
  useEffect(() => {
    const tts = new TextToSpeech();
    tts.onStart = () => setIsSpeaking(true);
    tts.onEnd = () => setIsSpeaking(false);
    ttsRef.current = tts;

    return () => {
      tts.stop();
    };
  }, [setIsSpeaking]);

  // Initialize STT
  useEffect(() => {
    const stt = new SpeechToText();
    stt.onResult = (text: string) => {
      setInterimText('');
      if (text.trim()) {
        handleSendMessage(text.trim());
      }
    };
    stt.onInterim = (text: string) => {
      setInterimText(text);
    };
    stt.onEnd = () => {
      setIsListening(false);
    };
    sttRef.current = stt;

    return () => {
      stt.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsListening]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // Send initial greeting
  useEffect(() => {
    if (sessionId && !hasGreeted.current && transcript.length === 0) {
      hasGreeted.current = true;
      sendToAI('__greeting__');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Sync transcript every 5 messages
  useEffect(() => {
    if (messageCountSinceSync.current >= 5) {
      messageCountSinceSync.current = 0;
      syncTranscript();
    }
  }, [transcript.length, syncTranscript]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase: string): string => {
    const labels: Record<string, string> = {
      greeting: 'Saludo',
      exploration: 'Exploracion',
      presentation: 'Presentacion',
      objection_handling: 'Resolviendo dudas',
      closing: 'Cierre',
    };
    return labels[phase] || phase;
  };

  const sendToAI = useCallback(async (userMessage: string) => {
    if (!sessionId || !course) return;

    setIsLoading(true);

    try {
      const isClosingPhase = timerSeconds > (course.sessionDuration * 60 * 0.8);

      const response = await fetch('/api/info-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          courseName: course.name,
          courseDescription: course.description,
          courseObjectives: course.objectives,
          courseBenefits: course.benefits,
          courseModules: modules,
          coursePlans: plans,
          courseTopics: course.topics,
          objectionResponses: course.objectionResponses,
          testimonials: course.testimonials,
          urgencyHooks: course.urgencyHooks,
          targetAudience: course.targetAudience,
          durationInfo: course.durationInfo,
          modality: course.modality,
          clientName,
          clientAge,
          clientOccupation,
          courseFor,
          recentMessages: transcript.slice(-10),
          language: 'es',
          sessionDuration: course.sessionDuration,
          timerSeconds,
          sessionId,
          isClosingPhase,
        }),
      });

      if (!response.ok) throw new Error('Error en la respuesta del servidor');

      const data: InfoChatResponse = await response.json();

      // Add AI message to transcript
      const aiEntry: InfoSessionTranscriptEntry = {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
        phase: data.phase,
      };
      addTranscriptEntry(aiEntry);
      messageCountSinceSync.current++;

      // Update phase label
      setCurrentPhaseLabel(getPhaseLabel(data.phase));

      // Speak the response
      if (ttsRef.current) {
        await ttsRef.current.speak(data.message);
      }

      // Handle signals
      if (data.shouldNotifyCoach) {
        try {
          await fetch('/api/info-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              type: 'closing_ready',
              orgId: course.orgId,
            }),
          });
          setCoachNotified(true);
        } catch {
          // Silent fail for notification
        }
      }

      if (data.objectionDetected) {
        addObjection(data.objectionDetected);
      }

      if (data.suggestedClosingMode) {
        setClosingMode(data.suggestedClosingMode);
        await syncTranscript();
        setPhase('closing');
      }
    } catch (err) {
      console.error('Error sending message to AI:', err);
      const errorEntry: InfoSessionTranscriptEntry = {
        role: 'assistant',
        content: 'Disculpa, hubo un problema. ¿Podrias repetir tu pregunta?',
        timestamp: Date.now(),
      };
      addTranscriptEntry(errorEntry);
    } finally {
      setIsLoading(false);
    }
  }, [
    sessionId, course, modules, plans, transcript, timerSeconds,
    clientName, clientAge, clientOccupation, courseFor,
    setIsLoading, addTranscriptEntry, addObjection, setClosingMode,
    setCoachNotified, setPhase, syncTranscript,
  ]);

  const handleSendMessage = useCallback((text: string) => {
    if (!text.trim() || isLoading) return;

    const userEntry: InfoSessionTranscriptEntry = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    addTranscriptEntry(userEntry);
    messageCountSinceSync.current++;
    setInputText('');

    sendToAI(text.trim());
  }, [isLoading, addTranscriptEntry, sendToAI]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputText);
    }
  };

  const toggleVoiceMode = () => {
    if (isVoiceMode) {
      sttRef.current?.stop();
      setIsListening(false);
      setIsVoiceMode(false);
      setInterimText('');
    } else {
      setIsVoiceMode(true);
      sttRef.current?.start();
      setIsListening(true);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[600px] max-h-screen">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-[#D3FB52]/10 border border-[#D3FB52]/30">
            <span className="text-xs font-medium text-[#D3FB52]">{currentPhaseLabel}</span>
          </div>
          {course && (
            <span className="text-sm text-gray-400 hidden sm:inline">{course.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-mono text-gray-300">{formatTime(timerSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-between overflow-hidden p-4">
        {/* AI Orb */}
        <div className="flex-shrink-0 flex items-center justify-center py-6">
          <InfoAiOrb
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isLoading}
          />
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="flex-1 w-full max-w-lg overflow-y-auto space-y-3 px-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        >
          {transcript.map((entry, index) => (
            <div
              key={index}
              className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  entry.role === 'user'
                    ? 'bg-[#D3FB52]/20 text-white rounded-br-md'
                    : 'bg-white/5 text-gray-200 rounded-bl-md border border-white/5'
                }`}
              >
                {entry.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white/5 border border-white/5">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-[#D3FB52]/60 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-[#D3FB52]/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="w-2 h-2 bg-[#D3FB52]/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}
          {interimText && (
            <div className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-[#D3FB52]/10 text-gray-400 text-sm italic">
                {interimText}...
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 w-full max-w-lg pt-3">
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-white/5 border border-white/10">
            {/* Voice toggle */}
            <button
              type="button"
              onClick={toggleVoiceMode}
              className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isVoiceMode
                  ? 'bg-[#D3FB52] text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
              title={isVoiceMode ? 'Desactivar voz' : 'Activar voz'}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>

            {/* Text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isVoiceMode ? 'Habla o escribe tu mensaje...' : 'Escribe tu mensaje...'}
              disabled={isLoading}
              className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm focus:outline-none disabled:opacity-50 px-2"
            />

            {/* Send button */}
            <button
              type="button"
              onClick={() => handleSendMessage(inputText)}
              disabled={!inputText.trim() || isLoading}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-[#D3FB52] text-black disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[#c5ed44] active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          {/* Voice mode indicator */}
          {isVoiceMode && (
            <p className="text-center text-xs text-gray-500 mt-2">
              {isListening ? 'Escuchando...' : 'Activando microfono...'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
