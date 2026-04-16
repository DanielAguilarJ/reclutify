/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Mic, CheckCircle2, AlertCircle } from 'lucide-react';
import { useInterviewStore } from '@/store/interviewStore';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import Logo from '@/components/ui/Logo';
import AiOrb from './AiOrb';

export default function InterviewRoom({ roleId }: { roleId: string }) {
  const { roles } = useAdminStore();
  const currentRole = roles.find(r => r.id === roleId);

  const {
    topics,
    currentTopicIndex,
    nextTopic,
    transcript,
    addTranscriptEntry,
    timerSeconds,
    setTimerSeconds,
    isAiSpeaking,
    setIsAiSpeaking,
    currentSubtitle,
    setCurrentSubtitle,
    isRecording,
    setIsRecording,
    isProcessing,
    setIsProcessing,
    setPhase,
    candidate,
    sessionId,
    setSessionId,
    setRoleId: setStoreRoleId,
    screenStream,
  } = useInterviewStore();

  const { language } = useAppStore();
  const { candidates, addCandidate, updateCandidate } = useAdminStore();
  const t = dictionaries[language];
  const langCode = language === 'es' ? 'es-ES' : 'en-US';

  const [hasStarted, setHasStarted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const speakingRef = useRef<boolean>(false);  // TTS mutex to prevent duplicates
  const audioRef = useRef<HTMLAudioElement | null>(null); // current audio element
  const interviewActiveRef = useRef<boolean>(false); // tracks if interview is active for safe SR restart
  const ttsTimeoutRef = useRef<NodeJS.Timeout | null>(null); // safety timeout for stuck TTS

  const currentTopic = topics[currentTopicIndex];
  const isLastTopic = currentTopicIndex === topics.length - 1;

  // Sync to Admin Pipeline as "in-progress" automatically — ALWAYS save progress
  useEffect(() => {
    if (!hasStarted) return;
    
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = `cand-${Date.now()}`;
      setSessionId(currentSessionId);
    }

    // Also ensure roleId is in the interview store for InterviewComplete
    setStoreRoleId(roleId);

    const exists = candidates.find(c => c.id === currentSessionId);
    if (!exists) {
      addCandidate({
        id: currentSessionId,
        candidate,
        roleId,
        roleTitle: currentRole?.title || 'Candidate',
        date: Date.now(),
        status: 'in-progress',
        transcript,
        duration: timerSeconds,
      });
    } else {
      updateCandidate(currentSessionId, { transcript, duration: timerSeconds });
    }
  }, [transcript, hasStarted, timerSeconds]);

  // Safe restart of SpeechRecognition — prevents silent death
  const restartRecognition = useCallback(() => {
    if (!interviewActiveRef.current || speakingRef.current) return;
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch (e) { /* already stopped */ }
    // Small delay to let the browser release resources
    setTimeout(() => {
      if (!interviewActiveRef.current || speakingRef.current) return;
      try {
        rec.start();
        setIsRecording(true);
      } catch (e) {
        console.warn('Recognition restart failed, retrying in 1s...', e);
        setTimeout(() => {
          if (!interviewActiveRef.current || speakingRef.current) return;
          try { rec.start(); setIsRecording(true); } catch(e2) {}
        }, 1000);
      }
    }, 300);
  }, []);

  // Initialize Speech APIs
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthesisRef.current = window.speechSynthesis;
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = langCode;

        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const finalTranscript = event.results[i][0].transcript;
              handleCandidateUtterance(finalTranscript);
            } else {
              interimTranscript += event.results[i][0].transcript;
              setCurrentSubtitle(interimTranscript);
            }
          }
        };

        // Auto-restart on recoverable errors
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          const fatalErrors = ['not-allowed', 'service-not-allowed', 'language-not-supported'];
          if (!fatalErrors.includes(event.error)) {
            // Recoverable error — auto restart after brief delay
            setTimeout(() => restartRecognition(), 500);
          }
        };

        // KEY FIX: Auto-restart when recognition silently ends
        recognitionRef.current.onend = () => {
          // Only restart if interview is active and AI is not speaking
          if (interviewActiveRef.current && !speakingRef.current) {
            console.log('SpeechRecognition ended unexpectedly — restarting...');
            setTimeout(() => restartRecognition(), 300);
          }
        };
      }
    }
  }, [langCode, restartRecognition]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Attach stream to video element AFTER the DOM renders the <video> tag
  useEffect(() => {
    if (hasStarted && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [hasStarted]);

  // Handle Candidate Input
  const handleCandidateUtterance = async (text: string) => {
    if (!text.trim() || isProcessing || isAiSpeaking || speakingRef.current) return;

    addTranscriptEntry({ role: 'user', content: text, timestamp: Date.now() });
    setCurrentSubtitle('');
    setIsRecording(false);
    setIsProcessing(true);

    // Stop recognition while processing
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    try {
      // Send full conversation transcript for complete context
      const allMessages = [
        ...transcript.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];

      // Send all topics with completion status and rubric data
      const allTopics = topics.map((t, idx) => ({
        label: t.label,
        rubric: t.rubric || null,
        status: idx < currentTopicIndex ? 'completed' : idx === currentTopicIndex ? 'current' : 'upcoming',
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTopic: currentTopic.label,
          allTopics,
          language: language,
          roleTitle: currentRole?.title || 'Candidate',
          roleDescription: `
            ${currentRole?.description || ''}
            ${currentRole?.jobType ? `- Tipo de Puesto: ${currentRole.jobType}` : ''}
            ${currentRole?.location ? `- Ubicación: ${currentRole.location}` : ''}
            ${currentRole?.salary ? `- Salario: ${currentRole.salary}` : ''}
          `.trim(),
          recentMessages: allMessages,
          isLastTopic,
        }),
      });

      const data = await response.json();
      if (data.message) {
        let aiMessage = data.message;
        let advanceTopic = false;
        let finishInterview = false;

        // Module 5: Store sentiment data on the user's transcript entry (retroactively)
        if (data.sentiment) {
          const currentTranscript = useInterviewStore.getState().transcript;
          const lastUserIdx = currentTranscript.length - 1; // We just added the user entry above
          if (lastUserIdx >= 0 && currentTranscript[lastUserIdx].role === 'user') {
            const updatedEntry = { ...currentTranscript[lastUserIdx], sentiment: data.sentiment };
            const newTranscript = [...currentTranscript];
            newTranscript[lastUserIdx] = updatedEntry;
            // Direct set since there's no updateTranscriptEntry helper
            useInterviewStore.setState({ transcript: newTranscript });
          }
        }

        if (aiMessage.includes('[END_INTERVIEW]')) {
          finishInterview = true;
          aiMessage = aiMessage.replace(/\[END_INTERVIEW\]/g, '').trim();
        } else if (aiMessage.includes('[NEXT_TOPIC]')) {
          advanceTopic = true;
          aiMessage = aiMessage.replace(/\[NEXT_TOPIC\]/g, '').trim();
        }

        if (aiMessage) {
          addTranscriptEntry({ role: 'assistant', content: aiMessage, timestamp: Date.now() });
          // Speak the AI message. If we also need to advance or finish, do it AFTER speaking finishes.
          await speakText(aiMessage);
        }

        if (finishInterview) {
          endInterview();
        } else if (advanceTopic) {
          if (isLastTopic) {
            endInterview(); // Fallback in case it outputs NEXT_TOPIC instead of END_INTERVIEW on the last topic
          } else {
            // Advance to next topic
            nextTopic();
          }
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Start the interview
  const startInterview = async () => {
    setHasStarted(true);
    setIsAiSpeaking(true);
    interviewActiveRef.current = true;  // Enable auto-restart for SpeechRecognition

    const greeting = language === 'es'
      ? `Hola ${candidate.name}, soy Zara. Soy la reclutadora encargada de tu proceso para el puesto de ${currentRole?.title}. ¿Comenzamos? Hábleme un poco de tu experiencia relevante, por favor.`
      : `Hi ${candidate.name}, I am Zara. I am the recruiter in charge of your process for the ${currentRole?.title} role. Shall we begin? Please tell me a bit about your relevant experience.`;

    addTranscriptEntry({
      role: 'assistant',
      content: greeting,
      timestamp: Date.now(),
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      // Try to attach immediately if ref is already mounted
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // The useEffect above will also try to attach after re-render

      // Start video recording
        try {
          const tracks: MediaStreamTrack[] = [];
          if (screenStream && screenStream.getVideoTracks().length > 0) {
            tracks.push(screenStream.getVideoTracks()[0]);
          } else if (stream.getVideoTracks().length > 0) {
            tracks.push(stream.getVideoTracks()[0]);
          }

          if (stream.getAudioTracks().length > 0) {
            tracks.push(stream.getAudioTracks()[0]);
          }

          const recordingStream = new MediaStream(tracks);
          const mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'video/webm' });
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };
          mediaRecorder.start(1000);
        } catch (e) {
          console.error('MediaRecorder error:', e);
        }

        // setup Audio Analyser for the bottom widget
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          const maxVol = Math.max(...dataArray);
          setVolumeLevel(maxVol / 255);
          animationRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
    } catch (err) {
      console.error('Media error:', err);
    }

    // Start timer
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    speakText(greeting);
  };

  // Text to Speech — returns a promise that resolves when speech finishes
  const speakText = (text: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      // MUTEX: if already speaking, skip
      if (speakingRef.current) {
        resolve();
        return;
      }
      speakingRef.current = true;

      setIsAiSpeaking(true);
      setCurrentSubtitle(text);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }

      // Cancel any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }

      // Clear any previous TTS safety timeout
      if (ttsTimeoutRef.current) {
        clearTimeout(ttsTimeoutRef.current);
      }

      const onFinishSpeaking = () => {
        // Clear safety timeout since we finished normally
        if (ttsTimeoutRef.current) {
          clearTimeout(ttsTimeoutRef.current);
          ttsTimeoutRef.current = null;
        }
        speakingRef.current = false;
        setIsAiSpeaking(false);
        setCurrentSubtitle('');
        if (interviewActiveRef.current) {
          setIsRecording(true);
          try {
            recognitionRef.current?.start();
          } catch(e) {}
        }
        resolve();
      };

      // SAFETY NET: If TTS hasn't finished after 60 seconds, force-resolve
      // This prevents the interview from getting permanently stuck
      ttsTimeoutRef.current = setTimeout(() => {
        console.warn('TTS safety timeout triggered — forcing speech end');
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (synthesisRef.current) {
          synthesisRef.current.cancel();
        }
        onFinishSpeaking();
      }, 60000);

      fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      })
        .then((response) => {
          if (response.ok) {
            return response.blob();
          }
          throw new Error('TTS failed');
        })
        .then((audioBlob) => {
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.onended = onFinishSpeaking;
          audio.onerror = () => {
            fallbackSpeech(text, onFinishSpeaking);
          };
          audio.play().catch(() => fallbackSpeech(text, onFinishSpeaking));
        })
        .catch(() => {
          fallbackSpeech(text, onFinishSpeaking);
        });
    });
  };

  const fallbackSpeech = (text: string, onDone: () => void) => {
    if (!synthesisRef.current) { onDone(); return; }
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = synthesisRef.current.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.startsWith(language) && v.name.includes('Google')
    ) || voices.find((v) => v.lang.startsWith(language));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = onDone;
    synthesisRef.current.speak(utterance);
  };

  const handleNextTopic = () => {
    if (isLastTopic) {
      endInterview();
    } else {
      nextTopic();
    }
  };

  const endInterview = () => {
    // Disable auto-restart of SpeechRecognition
    interviewActiveRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
    if (synthesisRef.current) synthesisRef.current.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    
    // Force-clear stuck state
    speakingRef.current = false;
    setIsAiSpeaking(false);
    setIsProcessing(false);
    setIsRecording(false);
    
    // Save duration
    localStorage.setItem('tempDuration', timerSeconds.toString());

    // CRITICAL: Force-save transcript to admin store before transitioning
    // This ensures data is persisted even if InterviewComplete fails
    const currentSessionId = sessionId || `cand-${Date.now()}`;
    if (!sessionId) setSessionId(currentSessionId);

    const exists = candidates.find(c => c.id === currentSessionId);
    if (exists) {
      updateCandidate(currentSessionId, {
        transcript,
        duration: timerSeconds,
        status: 'in-progress', // Will be updated to 'completed' by InterviewComplete
      });
    } else {
      addCandidate({
        id: currentSessionId,
        candidate,
        roleId,
        roleTitle: currentRole?.title || 'Candidate',
        date: Date.now(),
        status: 'in-progress',
        transcript,
        duration: timerSeconds,
      });
    }
    
    // Stop recording and upload
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const localUrl = URL.createObjectURL(blob);
        
        // Save local URL as immediate fallback
        localStorage.setItem('tempVideoUrl', localUrl);

        const formData = new FormData();
        formData.append('file', blob);
        try {
          const res = await fetch('/api/upload-video', {
             method: 'POST',
             body: formData
          });
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              // Overwrite local blob with persistent R2 storage URL if successful
              localStorage.setItem('tempVideoUrl', data.url);
            }
          }
        } catch(e) { 
          console.error('R2 Upload failed, keeping local blob URL', e); 
        }
        
        // Stop camera and screen tracks
        if (videoRef.current?.srcObject) {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
        }
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
        }
        setPhase('complete');
      };
      mediaRecorderRef.current.stop();
    } else {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      setPhase('complete');
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      interviewActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
      if (synthesisRef.current) synthesisRef.current.cancel();
      if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e) {}
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-[#eef2ff] flex flex-col font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="h-20 px-6 flex items-center justify-between z-20">
        <div className="flex flex-col">
          <Logo />
          <div className="flex items-center gap-1.5 mt-1 ml-1 text-xs font-medium text-success">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Online
          </div>
        </div>

        {hasStarted && (
          <div className="absolute left-1/2 top-6 -translate-x-1/2 flex items-center gap-6">
            {topics.map((topic, idx) => {
              const isActive = idx === currentTopicIndex;
              const isPast = idx < currentTopicIndex;

              return (
                <div key={topic.id} className="flex flex-col items-center gap-2">
                  <span
                    className={`text-xs font-medium tracking-wide transition-colors ${
                      isActive ? 'text-primary' : isPast ? 'text-primary/60' : 'text-muted/50'
                    }`}
                  >
                    {topic.label.length > 20 ? topic.label.substring(0, 20) + '...' : topic.label}
                  </span>
                  <div
                    className={`h-0.5 rounded-full transition-all duration-500 ${
                      isActive ? 'w-24 bg-primary' : isPast ? 'w-16 bg-primary/40' : 'w-16 bg-black/10'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {hasStarted ? (
          <div className="flex items-center gap-4">
            <button 
              onClick={endInterview}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-danger bg-danger/10 hover:bg-danger/20 transition-colors cursor-pointer"
            >
              {language === 'es' ? 'Terminar Anticipadamente' : 'End Early'}
            </button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-black/[0.04]">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground tracking-tight">
                {formatTime(timerSeconds)}
              </span>
            </div>
            {/* Removing Manual Topic Buttons per User Request */}
          </div>
        ) : (
          <div className="w-[120px]" /> /* spacer */
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative w-full h-full flex items-center justify-center">
        {/* Background AI Orb - only show centered when NOT started */}
        {!hasStarted && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <AiOrb isSpeaking={isAiSpeaking} isProcessing={isProcessing} />
          </div>
        )}

        {!hasStarted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 ml-64 bg-white rounded-3xl p-8 max-w-md shadow-xl shadow-black/[0.03] border border-black/[0.04]"
          >
            <h2 className="text-xl font-bold text-foreground mb-4">
              {t.preInterviewTitle}
            </h2>
            <ul className="space-y-4 mb-8">
              {t.preInterviewPoints.map((point, idx) => (
                <li key={idx} className="flex gap-3 text-sm text-muted/90 leading-relaxed">
                  <div className="mt-1">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={startInterview}
              className="w-full py-3.5 rounded-full bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center shadow-lg shadow-primary/25 cursor-pointer"
            >
              {t.startInterviewBtn}
            </button>
          </motion.div>
        ) : (
          /* === TWO-COLUMN LAYOUT: Orb Left | Chat Right === */
          <div className="relative z-10 w-full h-full flex">
            {/* LEFT COLUMN: Orb + Camera */}
            <div className="w-[40%] h-full flex flex-col items-center justify-center relative">
              <div className="pointer-events-none">
                <AiOrb isSpeaking={isAiSpeaking} isProcessing={isProcessing} />
              </div>

              {/* Camera Widget - below the orb */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 w-64 bg-white rounded-3xl shadow-xl shadow-black/[0.04] p-3 border border-black/[0.04]"
              >
                {/* Mic row */}
                <div className="flex items-center justify-between px-2 mb-2 mt-1">
                  <div className="flex items-center gap-2 bg-foreground/5 py-1.5 px-3 rounded-full">
                    <Mic className="h-3.5 w-3.5 text-foreground" />
                    <span className="text-xs font-medium text-foreground">{t.micDefault}</span>
                  </div>
                  <div className="flex items-end gap-0.5 h-3 pr-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 rounded-full transition-all duration-75"
                        style={{
                          height: `${Math.min(100, Math.max(30, volumeLevel * 100 * (1 + (i % 5) * 0.1)))}%`,
                          backgroundColor: volumeLevel > 0.05 ? 'var(--color-primary)' : '#e2e8f0',
                        }}
                      />
                    ))}
                  </div>
                </div>
                {/* Video Feed */}
                <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>
            </div>

            {/* RIGHT COLUMN: Chat History + Status */}
            <div className="w-[60%] h-full flex flex-col justify-end pb-10 pr-8 pl-4">
              {/* Persistent Chat History */}
              <div className="flex flex-col gap-3 mb-4 overflow-y-auto max-h-[60vh]">
                <AnimatePresence initial={false}>
                  {transcript.slice(-4).map((msg, idx) => (
                    <motion.div
                      key={`${msg.timestamp}-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="flex flex-col items-start max-w-lg">
                          <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider block mb-1 ml-1">Zara</span>
                          <p className="text-base font-medium text-foreground leading-snug tracking-tight bg-white/80 px-5 py-3 rounded-2xl rounded-tl-sm backdrop-blur-md shadow-sm border border-white/60">
                            {msg.content}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end max-w-lg">
                          <span className="text-xs font-semibold text-muted/70 uppercase tracking-wider block mb-1 mr-1">
                            {t.you || 'You'}
                          </span>
                          <p className="text-base font-medium text-white leading-snug tracking-tight bg-primary px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm border border-primary">
                            {msg.content}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* Live STT */}
                  {currentSubtitle && !isAiSpeaking && (
                     <motion.div
                       key="interim-user"
                       initial={{ opacity: 0, x: 20 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0 }}
                       className="flex flex-col items-end"
                     >
                       <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider block mb-1 mr-1">
                         {t.you || 'You'} ...
                       </span>
                       <p className="text-base font-medium text-white/90 leading-snug tracking-tight bg-primary/80 px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm border border-primary/50 italic max-w-lg">
                         {currentSubtitle}
                       </p>
                     </motion.div>
                  )}
                  
                  {/* Live AI TTS */}
                  {currentSubtitle && isAiSpeaking && !transcript.some(t => t.content === currentSubtitle) && (
                    <motion.div
                      key="interim-ai"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-start"
                    >
                      <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider block mb-1 ml-1">Zara</span>
                      <p className="text-base font-medium text-foreground leading-snug tracking-tight bg-white/80 px-5 py-3 rounded-2xl rounded-tl-sm backdrop-blur-md shadow-sm border border-white/60 animate-pulse max-w-lg">
                        {currentSubtitle}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Status Pill */}
              <AnimatePresence>
                 {(isRecording || isProcessing || isAiSpeaking) && (
                   <motion.div
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     className="self-start flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-black/[0.04]"
                   >
                     {isRecording ? (
                       <>
                         <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                         <span className="text-xs font-semibold text-danger uppercase tracking-wider">{t.recordingPill}</span>
                       </>
                     ) : isProcessing ? (
                       <>
                         <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                         <span className="text-xs font-semibold text-primary uppercase tracking-wider">{t.processingPill}</span>
                       </>
                     ) : (
                       <>
                         <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                         <span className="text-xs font-semibold text-primary uppercase tracking-wider">{t.waitingPill}</span>
                       </>
                     )}
                   </motion.div>
                 )}
              </AnimatePresence>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
