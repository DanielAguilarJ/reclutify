/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Mic, CheckCircle2, AlertCircle, Square } from "lucide-react";
import { useInterviewStore } from "@/store/interviewStore";
import { useAdminStore } from "@/store/adminStore";
import { useAppStore } from "@/store/appStore";
import { dictionaries } from "@/lib/i18n";
import Logo from "@/components/ui/Logo";
import AiOrb from "./AiOrb";
import {
  computeInterviewPlan,
  getQuestionBudget,
} from "@/lib/interviewTimingEngine";

export default function InterviewRoom({
  roleId,
  publicResultId,
}: {
  roleId: string;
  publicResultId?: string;
}) {
  const { roles } = useAdminStore();
  const currentRole = roles.find((r) => r.id === roleId);

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
    selectedCameraId,
    selectedMicId,
  } = useInterviewStore();

  const { language } = useAppStore();
  const { candidates, addCandidate, updateCandidate } = useAdminStore();
  const t = dictionaries[language];
  const langCode = language === "es" ? "es-ES" : "en-US";

  const [hasStarted, setHasStarted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const speakingRef = useRef<boolean>(false); // TTS mutex to prevent duplicates
  const audioRef = useRef<HTMLAudioElement | null>(null); // current audio element
  const interviewActiveRef = useRef<boolean>(false); // tracks if interview is active for safe SR restart
  const ttsTimeoutRef = useRef<NodeJS.Timeout | null>(null); // safety timeout for stuck TTS
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  // Tracks the current AudioContext so it can be closed when the interview ends
  // or the component unmounts — prevents ghost AudioContext instances.
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Tracks the last TTS object URL so it can be revoked when no longer needed,
  // preventing memory accumulation across multiple questions.
  const currentAudioUrlRef = useRef<string | null>(null);
  // Throttle the volume RAF loop — prevents up to 60 setState/s on the component.
  const lastVolUpdateRef = useRef<number>(0);
  const lastVolValueRef = useRef<number>(0);
  // FIX 3: Prevents double nextTopic() when timer force-advance and speakText() resolve simultaneously
  const topicAdvancingRef = useRef<boolean>(false);
  // FIX 5: Client-side dead-end detection — counts consecutive empty/evasive answers
  const consecutiveEmptyRef = useRef<number>(0);
  // FIX 6: Tracks where the current topic started in the transcript (for hard-limit guard)
  const topicStartIndexRef = useRef<number>(0);
  // Manual candidate turn: recognition may produce several final fragments, but
  // nothing is submitted until the candidate explicitly presses "Finish answer".
  const utteranceBufferRef = useRef<string>("");
  const candidateInterimRef = useRef<string>("");
  const candidateTurnActiveRef = useRef<boolean>(false);
  const candidateTurnSubmissionPendingRef = useRef<boolean>(false);
  const candidateTurnSubmissionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const completeCandidateTurnRef = useRef<() => void>(() => {});
  const processingLockRef = useRef<boolean>(false); // hard lock to prevent concurrent API calls
  // Ref to always point to the latest handleCandidateUtterance — solves stale closure
  const handleUtteranceRef = useRef<(text: string) => Promise<void>>(
    async () => {},
  );
  // Mutex to prevent concurrent SpeechRecognition restart attempts
  const restartingRef = useRef<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechInputError, setSpeechInputError] = useState<string | null>(null);
  const [processingTooLong, setProcessingTooLong] = useState(false);
  const processingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Tracks whether the native recognition object is actually running. The
  // watchdog can recover it, but only during a turn explicitly opened by the user.
  const recognitionRunningRef = useRef<boolean>(false);
  const lastRecognitionEventAtRef = useRef<number>(Date.now());
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentTopic = topics[currentTopicIndex];
  const isLastTopic = currentTopicIndex === topics.length - 1;

  // Compute the hard question limit using the shared timing engine (MUST stay in sync with API)
  const interviewDurationMins = Number(currentRole?.interviewDuration) || 30;
  const totalDurationSeconds = interviewDurationMins * 60;

  // Lazy-import not needed — engine is a pure module with zero React dependencies
  const interviewPlan = computeInterviewPlan(
    interviewDurationMins,
    topics.map((t) => ({
      label: t.label,
      weight: t.rubric?.weight ?? 5,
    })),
    { hasCv: !!candidate?.cvData },
  );
  const currentTopicBudget = getQuestionBudget(
    currentTopicIndex,
    interviewPlan,
  );
  const maxQuestionsHardLimit = currentTopicBudget.questionBudget;

  // Grace period: when time runs out but not all planned topics are covered yet,
  // we extend the interview until the AI naturally finishes (or a safety cap fires).
  // The original duration still drives PACING (budgets, urgency suggestions to the LLM),
  // but it no longer terminates the interview prematurely.
  const GRACE_CAP_MULT = 2; // safety net: never exceed 2× the planned duration
  const absoluteMaxSecs = totalDurationSeconds * GRACE_CAP_MULT;

  // Has at least one real (non-control) assistant message been delivered on the last topic?
  const lastTopicHasQuestion =
    isLastTopic &&
    (() => {
      const start = topicStartIndexRef.current;
      for (let i = start; i < transcript.length; i++) {
        const m = transcript[i];
        if (
          m.role === "assistant" &&
          !m.content.includes("[NEXT_TOPIC]") &&
          !m.content.includes("[END_INTERVIEW]")
        ) {
          return true;
        }
      }
      return false;
    })();
  const allTopicsCovered = isLastTopic && lastTopicHasQuestion;
  const isGracePeriod =
    hasStarted && timerSeconds >= totalDurationSeconds && !allTopicsCovered;

  // Closing phase: only fire at 90%+ AND when we're already on the last topic.
  // Previously this fired regardless of topic, telling the AI to wrap up prematurely.
  const isClosingPhase =
    hasStarted && timerSeconds >= totalDurationSeconds * 0.9 && isLastTopic;

  // Reset topic start index whenever the topic advances.
  // Bug 12 fix: also expose a synchronous helper for callers that need to
  // update the boundary BEFORE React schedules the next render (otherwise
  // the very first utterance after `nextTopic()` can be counted against the
  // previous topic's boundary).
  const syncAdvanceTopic = useCallback(() => {
    const latestLength = useInterviewStore.getState().transcript.length;
    topicStartIndexRef.current = latestLength;
    consecutiveEmptyRef.current = 0;
    nextTopic();
  }, [nextTopic]);

  useEffect(() => {
    topicStartIndexRef.current = useInterviewStore.getState().transcript.length;
    consecutiveEmptyRef.current = 0;
  }, [currentTopicIndex]);

  // Sync to Admin Pipeline as "in-progress" automatically — ALWAYS save progress
  // FIX 2: Removed `timerSeconds` from deps — it was triggering ~1800 Supabase writes/interview.
  // Duration is accurately captured in endInterview(); no need to sync on every tick.
  useEffect(() => {
    if (!hasStarted) return;

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = publicResultId || `cand-${Date.now()}`;
      setSessionId(currentSessionId);
    }

    // Also ensure roleId is in the interview store for InterviewComplete
    setStoreRoleId(roleId);

    const exists = candidates.find((c) => c.id === currentSessionId);
    if (!exists) {
      addCandidate({
        id: currentSessionId,
        candidate,
        roleId,
        roleTitle: currentRole?.title || "Candidate",
        date: Date.now(),
        status: "in-progress",
        transcript,
        duration: timerSeconds,
        source: publicResultId ? "public_link" : "ticket",
      });
    } else {
      updateCandidate(currentSessionId, { transcript, duration: timerSeconds });
    }
  }, [transcript, hasStarted]);

  // Timer hard-stop: only fires when EITHER
  //   (a) the planned time elapsed AND all topics have been covered (natural end), or
  //   (b) we exceeded the safety cap (2× planned duration) — prevents runaway sessions.
  // Otherwise the interview enters "grace period": the timer keeps running but the AI
  // continues asking the planned questions naturally. Topic transitions remain driven
  // by the AI via [NEXT_TOPIC]/[END_INTERVIEW] tags.
  useEffect(() => {
    const duration = Number(currentRole?.interviewDuration) || 30;
    if (!hasStarted || topics.length === 0) return;

    const totalSecs = duration * 60;
    const maxSecs = totalSecs * GRACE_CAP_MULT;

    const naturalEnd = timerSeconds >= totalSecs && allTopicsCovered;
    const safetyCap = timerSeconds >= maxSecs;

    if (
      (naturalEnd || safetyCap) &&
      !speakingRef.current &&
      !processingLockRef.current &&
      !candidateTurnActiveRef.current &&
      !candidateTurnSubmissionPendingRef.current
    ) {
      console.log(
        `[Timer Hard Stop] ${safetyCap ? "Safety cap (2×)" : "All topics covered"} — ending interview`,
      );
      const closingMsg =
        language === "es"
          ? `Ha sido un placer hablar contigo. Hemos llegado al final de nuestra entrevista. El equipo de evaluación revisará tu desempeño y te contactarán pronto. ¡Mucho éxito!`
          : `It's been great speaking with you. We've reached the end of our interview. The evaluation team will review your performance and be in touch soon. Best of luck!`;
      addTranscriptEntry({
        role: "assistant",
        content: closingMsg,
        timestamp: Date.now(),
      });
      speakText(closingMsg).then(() => endInterview());
    }
  }, [timerSeconds, hasStarted, allTopicsCovered]);

  // Recognition is active only inside a turn explicitly opened by the candidate.
  // Silence never closes or submits a turn; the candidate owns that decision.
  const shouldBeListening = useCallback(() => {
    return (
      interviewActiveRef.current &&
      candidateTurnActiveRef.current &&
      !speakingRef.current &&
      !processingLockRef.current
    );
  }, []);

  // Builds a BRAND NEW SpeechRecognition instance with every handler wired up.
  // We deliberately create a fresh instance every time we (re)start listening
  // instead of reusing the same one for the whole interview: long-lived Chrome
  // SpeechRecognition objects are known to silently stop firing ANY events at
  // all after many start/stop cycles, which is what caused the interview to
  // freeze permanently a few questions into a topic ("ya no escucha").
  const createRecognitionInstance = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langCode;

    rec.onstart = () => {
      recognitionRunningRef.current = true;
      lastRecognitionEventAtRef.current = Date.now();
    };

    rec.onresult = (event: any) => {
      lastRecognitionEventAtRef.current = Date.now();
      if (!candidateTurnActiveRef.current && !candidateTurnSubmissionPendingRef.current) return;

      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const fragment = event.results[i][0].transcript.trim();
        if (!fragment) continue;

        if (event.results[i].isFinal) {
          utteranceBufferRef.current +=
            (utteranceBufferRef.current ? " " : "") + fragment;
        } else {
          interimTranscript += (interimTranscript ? " " : "") + fragment;
        }
      }

      candidateInterimRef.current = interimTranscript;
      const preview = [utteranceBufferRef.current, interimTranscript]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!speakingRef.current) setCurrentSubtitle(preview);
    };

    // Recover browser-level recognition failures without closing the candidate's turn.
    rec.onerror = (event: any) => {
      lastRecognitionEventAtRef.current = Date.now();
      if (event.error === "no-speech") return;
      console.error("Speech recognition error:", event.error);
      const fatalErrors = [
        "not-allowed",
        "service-not-allowed",
        "language-not-supported",
      ];
      if (fatalErrors.includes(event.error)) {
        candidateTurnActiveRef.current = false;
        candidateTurnSubmissionPendingRef.current = false;
        setIsRecording(false);
        setIsTranscribing(false);
        setSpeechInputError(
          language === "es"
            ? "No se pudo usar el reconocimiento de voz. Revisa el permiso del micrófono e inténtalo de nuevo."
            : "Voice recognition could not be used. Check microphone permission and try again.",
        );
        return;
      }
      restartRecognition();
    };

    rec.onend = () => {
      recognitionRunningRef.current = false;
      lastRecognitionEventAtRef.current = Date.now();
      if (candidateTurnSubmissionPendingRef.current) {
        // Let the last onresult event land before assembling and submitting the turn.
        setTimeout(() => completeCandidateTurnRef.current(), 0);
      } else if (shouldBeListening()) {
        // Preserve a non-final fragment before replacing the browser recognition
        // instance. This keeps a browser restart from cutting the candidate off.
        const pendingInterim = candidateInterimRef.current.trim();
        if (pendingInterim) {
          utteranceBufferRef.current +=
            (utteranceBufferRef.current ? " " : "") + pendingInterim;
          candidateInterimRef.current = "";
        }
        console.log("SpeechRecognition ended during the manual turn — recovering...");
        setTimeout(() => restartRecognition(), 300);
      }
    };

    return rec;
  }, [langCode]);

  // Safe restart of SpeechRecognition — prevents silent death.
  // Always builds a FRESH instance (see createRecognitionInstance) instead of
  // reusing the old one — reusing the same instance across many start/stop
  // cycles is what let it get permanently stuck with no way to recover.
  const restartRecognition = useCallback(() => {
    if (!shouldBeListening()) return;
    if (restartingRef.current) return; // Prevent concurrent restarts
    restartingRef.current = true;

    const pendingInterim = candidateInterimRef.current.trim();
    if (pendingInterim) {
      utteranceBufferRef.current +=
        (utteranceBufferRef.current ? " " : "") + pendingInterim;
      candidateInterimRef.current = "";
    }

    const oldRec = recognitionRef.current;
    if (oldRec) {
      try {
        // Detach handlers first so the discarded instance can't also trigger
        // its own restart once we've already replaced it.
        oldRec.onend = null;
        oldRec.onerror = null;
        oldRec.stop();
      } catch (e) {
        /* already stopped */
      }
    }
    // Delay to let the browser release the microphone before grabbing it again
    setTimeout(() => {
      restartingRef.current = false;
      if (!shouldBeListening()) return;
      try {
        const fresh = createRecognitionInstance();
        if (!fresh) return;
        recognitionRef.current = fresh;
        fresh.start();
        setIsRecording(true);
      } catch (e) {
        // Already started or other error — ignore, the watchdog below will retry
      }
    }, 500);
  }, [createRecognitionInstance]);

  // Initialize Speech APIs
  useEffect(() => {
    if (typeof window !== "undefined") {
      synthesisRef.current = window.speechSynthesis;
      recognitionRef.current = createRecognitionInstance();
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.stop();
        } catch (e) {
          /* noop */
        }
      }
    };
  }, [langCode, createRecognitionInstance]);

  // Watchdog: if we SHOULD be listening but haven't seen a single recognition
  // event (onstart/onresult/onend/onerror) in a long time, the native object
  // has almost certainly died silently (a known Chrome quirk) — force a fresh
  // restart instead of leaving the interview frozen with no way to recover.
  useEffect(() => {
    watchdogIntervalRef.current = setInterval(() => {
      if (!shouldBeListening()) return;
      const silentFor = Date.now() - lastRecognitionEventAtRef.current;
      if (silentFor > 20000) {
        console.warn(
          "[STT Watchdog] No recognition activity for",
          silentFor,
          "ms — forcing restart",
        );
        lastRecognitionEventAtRef.current = Date.now();
        restartRecognition();
      }
    }, 5000);
    return () => {
      if (watchdogIntervalRef.current)
        clearInterval(watchdogIntervalRef.current);
    };
  }, [restartRecognition]);

  // Attach stream to video element AFTER the DOM renders the <video> tag
  useEffect(() => {
    if (
      hasStarted &&
      videoRef.current &&
      streamRef.current &&
      !videoRef.current.srcObject
    ) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [hasStarted]);

  // Handle Candidate Input
  // CRITICAL: This function reads ALL state from useInterviewStore.getState() at call-time
  // instead of from React closure variables. This is necessary because the speech recognition
  // onresult handler is set in a useEffect that only runs once, so any closure-captured values
  // would be stale (transcript: [], timerSeconds: 0, currentTopicIndex: 0, etc.).
  const handleCandidateUtterance = async (text: string) => {
    // Hard guard: block if AI is speaking, processing, or another call is in flight
    if (!text.trim() || processingLockRef.current || speakingRef.current)
      return;
    processingLockRef.current = true; // Acquire lock — released in finally block

    // ═══ READ FRESH STATE FROM STORE (avoid stale closure) ═══
    const store = useInterviewStore.getState();
    const freshTranscript = store.transcript;
    const freshTopicIndex = store.currentTopicIndex;
    const freshTimerSeconds = store.timerSeconds;
    const freshTopics = store.topics;
    const freshCurrentTopic = freshTopics[freshTopicIndex];
    const freshIsLastTopic = freshTopicIndex === freshTopics.length - 1;
    const freshSessionId = store.sessionId;
    const totalDurationSecs = interviewDurationMins * 60;
    // Grace-period-aware closing detection. Closing phase only fires when we're
    // on the last topic AND ≥90% elapsed. Grace period engages when the planned
    // duration is exceeded but the last topic hasn't been delivered yet.
    const freshLastTopicHasQuestion =
      freshIsLastTopic &&
      (() => {
        const start = topicStartIndexRef.current;
        for (let i = start; i < freshTranscript.length; i++) {
          const m = freshTranscript[i];
          if (
            m.role === "assistant" &&
            !m.content.includes("[NEXT_TOPIC]") &&
            !m.content.includes("[END_INTERVIEW]")
          ) {
            return true;
          }
        }
        return false;
      })();
    const freshAllTopicsCovered = freshIsLastTopic && freshLastTopicHasQuestion;
    const freshIsGracePeriod =
      freshTimerSeconds >= totalDurationSecs && !freshAllTopicsCovered;
    const freshIsClosingPhase =
      freshTimerSeconds >= totalDurationSecs * 0.9 && freshIsLastTopic;
    // ═══════════════════════════════════════════════════════════

    // Save transcript entry FIRST, before any early returns.
    addTranscriptEntry({ role: "user", content: text, timestamp: Date.now() });

    // Bug 16 fix: confused-candidate detection.
    // If the candidate replied with a SINGLE confused word (or a fragment under
    // 6 words that clearly isn't an answer), don't penalize the topic budget
    // and don't trip the dead-end counter yet — ask Zara to rephrase instead.
    const trimmedText = text.trim();
    const wordCount = trimmedText.split(/\s+/).filter(Boolean).length;
    const isSingleConfusedWord =
      wordCount <= 1 &&
      /^(c[oó]mo|qu[eé]|huh|what|sorry|perdón|repite|repeat|disculpa)\??$/i.test(
        trimmedText,
      );
    const isShortConfusedFragment =
      wordCount >= 2 &&
      wordCount <= 5 &&
      /^(no entend|no te ent|puedes repet|can you rep|i didn'?t catch|didn'?t understand|otra vez|again please)/i.test(
        trimmedText,
      );

    if (isSingleConfusedWord || isShortConfusedFragment) {
      // Re-deliver Zara's previous question simplified, without consuming budget.
      const lastZaraMsg = useInterviewStore
        .getState()
        .transcript.slice()
        .reverse()
        .find((m) => m.role === "assistant");
      const lastQuestionRaw = lastZaraMsg?.content || "";
      // Strip control tags and pull the last interrogative sentence if any
      const lastClean = lastQuestionRaw
        .replace(/\[NEXT_TOPIC\]|\[END_INTERVIEW\]/g, "")
        .trim();
      const lastQuestion =
        lastClean
          .match(/[^.!?¡¿\n]*\?+/g)
          ?.pop()
          ?.trim() || lastClean;
      const rephraseMsg =
        language === "es"
          ? `Claro, lo formulo más simple: ${lastQuestion}`
          : `Of course, let me put it more simply: ${lastQuestion}`;
      addTranscriptEntry({
        role: "assistant",
        content: rephraseMsg,
        timestamp: Date.now(),
      });
      await speakText(rephraseMsg);
      processingLockRef.current = false;
      setIsProcessing(false);
      return;
    }

    // Dead-end detection — if the candidate gives 2+ consecutive short/evasive answers
    const isEmpty =
      trimmedText.length < 12 ||
      /\b(no s[eé]|no lo sé|no sabría|tampoco sé|i don'?t know|not sure|no idea)\b/i.test(
        trimmedText,
      );
    if (isEmpty) {
      consecutiveEmptyRef.current += 1;
    } else {
      consecutiveEmptyRef.current = 0;
    }
    if (consecutiveEmptyRef.current >= 2) {
      consecutiveEmptyRef.current = 0;
      if (freshIsLastTopic) {
        const closingMsg =
          language === "es"
            ? `Entiendo. Hemos llegado al final de la entrevista. Muchas gracias por tu participación, ${candidate.name}. El equipo te contactará pronto. ¡Éxito!`
            : `I understand. We've reached the end of the interview. Thank you for your participation, ${candidate.name}. The team will be in touch soon. Best of luck!`;
        addTranscriptEntry({
          role: "assistant",
          content: closingMsg,
          timestamp: Date.now(),
        });
        await speakText(closingMsg);
        processingLockRef.current = false;
        endInterview();
      } else {
        const nextTopicLabel = freshTopics[freshTopicIndex + 1]?.label || "";
        const transitionMsg =
          language === "es"
            ? `De acuerdo, pasemos al siguiente tema: ${nextTopicLabel}.`
            : `Alright, let's move on to the next topic: ${nextTopicLabel}.`;
        addTranscriptEntry({
          role: "assistant",
          content: transitionMsg,
          timestamp: Date.now(),
        });
        await speakText(transitionMsg);
        syncAdvanceTopic();
        // UX FIX: ask the new topic's first real question right away instead
        // of leaving the candidate with nothing to respond to.
        await askOpeningQuestionForTopic();
        processingLockRef.current = false;
      }
      return;
    }

    setCurrentSubtitle("");
    setIsRecording(false);
    setIsProcessing(true);

    // BUG 2 FIX: Detect if processing takes too long (>15s) — show retry option
    setProcessingTooLong(false);
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    processingTimerRef.current = setTimeout(() => {
      setProcessingTooLong(true);
    }, 15000);

    // Stop recognition while processing
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    try {
      // Build conversation messages from FRESH transcript (not stale closure)
      // Re-read transcript because addTranscriptEntry above may have updated it
      const latestTranscript = useInterviewStore.getState().transcript;
      const allMessages = latestTranscript.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Safety: ensure the user message we just added is included
      const lastEntry = allMessages[allMessages.length - 1];
      if (
        !lastEntry ||
        lastEntry.content !== text ||
        lastEntry.role !== "user"
      ) {
        allMessages.push({ role: "user", content: text });
      }

      // Frontend Guard: Hard-coded question counter — Bug 6 fix.
      // The opening greeting DOES contain a question (the system prompt
      // requires it), so it MUST count. Previously we subtracted 1 here,
      // which gave topic 0 budget+1 questions while every other topic got
      // exactly `budget`. Now the counting is symmetric across all topics.
      const assistantMsgsInTopic = latestTranscript
        .slice(topicStartIndexRef.current)
        .filter(
          (m) =>
            m.role === "assistant" &&
            !m.content.includes("[NEXT_TOPIC]") &&
            !m.content.includes("[END_INTERVIEW]"),
        );
      const zaraQsInTopic = assistantMsgsInTopic.length;

      if (zaraQsInTopic >= maxQuestionsHardLimit) {
        console.log(
          `[Frontend Guard] Hard limit reached: ${zaraQsInTopic}/${maxQuestionsHardLimit} — forcing advance`,
        );
        setIsProcessing(false);
        if (freshIsLastTopic) {
          const closingMsg =
            language === "es"
              ? `Excelente, hemos cubierto todo lo que necesitaba saber sobre este tema. Muchas gracias por tu tiempo, ${candidate.name}. El equipo revisará tu entrevista y te contactarán pronto. ¡Mucho éxito!`
              : `Excellent, we've covered everything I needed to know. Thank you for your time, ${candidate.name}. The team will review your interview and be in touch soon. Best of luck!`;
          addTranscriptEntry({
            role: "assistant",
            content: closingMsg,
            timestamp: Date.now(),
          });
          await speakText(closingMsg);
          endInterview();
        } else {
          const nextTopicLabel = freshTopics[freshTopicIndex + 1]?.label || "";
          const transitionMsg =
            language === "es"
              ? `Muy bien, con eso cubrimos este tema. Pasemos al siguiente tema: ${nextTopicLabel}.`
              : `Great, that covers this topic. Let's move on to the next topic: ${nextTopicLabel}.`;
          addTranscriptEntry({
            role: "assistant",
            content: transitionMsg,
            timestamp: Date.now(),
          });
          await speakText(transitionMsg);
          syncAdvanceTopic();
          // UX FIX: ask the new topic's first real question right away instead
          // of leaving the candidate with nothing to respond to.
          await askOpeningQuestionForTopic();
        }
        processingLockRef.current = false;
        return;
      }

      // Send all topics with completion status and rubric data (using FRESH topic index)
      const allTopics = freshTopics.map((t, idx) => ({
        label: t.label,
        rubric: t.rubric || null,
        status:
          idx < freshTopicIndex
            ? "completed"
            : idx === freshTopicIndex
              ? "current"
              : "upcoming",
      }));

      // BUG 2 FIX: AbortController with 30s timeout to prevent infinite hangs
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTopic: freshCurrentTopic?.label || "",
          allTopics,
          cvData: candidate?.cvData || null,
          candidateName: candidate?.name || "",
          language: language,
          roleTitle: currentRole?.title || "Candidate",
          roleDescription: `
            ${currentRole?.description || ""}
            ${currentRole?.jobType ? `- Tipo de Puesto: ${currentRole.jobType}` : ""}
            ${currentRole?.location ? `- Ubicación: ${currentRole.location}` : ""}
            ${currentRole?.salary ? `- Salario: ${currentRole.salary}` : ""}
          `.trim(),
          recentMessages: allMessages,
          isLastTopic: freshIsLastTopic,
          interviewDuration:
            Number(currentRole?.interviewDuration) ||
            Number(useInterviewStore.getState().interviewDuration) ||
            30,
          timerSeconds: freshTimerSeconds,
          currentTopicIndex: freshTopicIndex,
          topicStartIndex: topicStartIndexRef.current,
          isClosingPhase: freshIsClosingPhase,
          isGracePeriod: freshIsGracePeriod,
          isOpeningPhase: false,
          sessionId: freshSessionId || "unknown-session",
        }),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);

      const data = await response.json();
      if (data.message) {
        let aiMessage = data.message;
        let advanceTopic = false;
        let finishInterview = false;

        // Store sentiment data on the user's transcript entry
        if (data.sentiment) {
          const currentTranscript = useInterviewStore.getState().transcript;
          const lastUserIdx = currentTranscript.length - 1;
          if (
            lastUserIdx >= 0 &&
            currentTranscript[lastUserIdx].role === "user"
          ) {
            const updatedEntry = {
              ...currentTranscript[lastUserIdx],
              sentiment: data.sentiment,
            };
            const newTranscript = [...currentTranscript];
            newTranscript[lastUserIdx] = updatedEntry;
            useInterviewStore.setState({ transcript: newTranscript });
          }
        }

        if (aiMessage.includes("[END_INTERVIEW]")) {
          finishInterview = true;
          aiMessage = aiMessage.replace(/\[END_INTERVIEW\]/g, "").trim();
        } else if (aiMessage.includes("[NEXT_TOPIC]")) {
          advanceTopic = true;
          aiMessage = aiMessage.replace(/\[NEXT_TOPIC\]/g, "").trim();
        }

        if (aiMessage) {
          addTranscriptEntry({
            role: "assistant",
            content: aiMessage,
            timestamp: Date.now(),
          });
          await speakText(aiMessage);
        }

        // Re-read fresh isLastTopic in case topic advanced during speakText
        const postSpeakState = useInterviewStore.getState();
        const postSpeakIsLastTopic =
          postSpeakState.currentTopicIndex === postSpeakState.topics.length - 1;

        if (finishInterview) {
          endInterview();
        } else if (advanceTopic) {
          if (!topicAdvancingRef.current) {
            topicAdvancingRef.current = true;
            setTimeout(() => {
              topicAdvancingRef.current = false;
            }, 2000);
            if (postSpeakIsLastTopic) {
              endInterview();
            } else {
              syncAdvanceTopic();
              // UX FIX: ask the new topic's first real question right away
              // instead of leaving the candidate with nothing to respond to.
              await askOpeningQuestionForTopic();
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error("Chat error:", error);

      // BUG 2 FIX: On timeout or network failure, inform the candidate instead of silent hang
      const isAbort = error instanceof Error && error.name === "AbortError";
      const errorMsg =
        language === "es"
          ? isAbort
            ? "Hubo un problema de conexión. ¿Podrías repetir tu respuesta?"
            : "Ocurrió un error temporal. ¿Podrías repetir lo que dijiste?"
          : isAbort
            ? "There was a connection timeout. Could you repeat your answer?"
            : "A temporary error occurred. Could you repeat what you said?";

      addTranscriptEntry({
        role: "assistant",
        content: errorMsg,
        timestamp: Date.now(),
      });
      await speakText(errorMsg);
    } finally {
      setIsProcessing(false);
      processingLockRef.current = false;
      setProcessingTooLong(false);
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
      // The next listening turn is opened only by an explicit candidate click.
    }
  };

  // Keep the ref always pointing to the latest handler
  handleUtteranceRef.current = handleCandidateUtterance;

  const completeCandidateTurn = () => {
    if (!candidateTurnSubmissionPendingRef.current) return;
    candidateTurnSubmissionPendingRef.current = false;
    if (candidateTurnSubmissionTimerRef.current) {
      clearTimeout(candidateTurnSubmissionTimerRef.current);
      candidateTurnSubmissionTimerRef.current = null;
    }

    const fullUtterance = [
      utteranceBufferRef.current,
      candidateInterimRef.current,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    utteranceBufferRef.current = "";
    candidateInterimRef.current = "";
    setCurrentSubtitle("");
    setIsTranscribing(false);

    if (fullUtterance.length < 2) {
      setSpeechInputError(
        language === "es"
          ? "No alcanzamos a escuchar una respuesta. Pulsa el botón e inténtalo de nuevo; tu turno no avanzó."
          : "We couldn't hear an answer. Press the button and try again; your turn was not advanced.",
      );
      return;
    }

    setSpeechInputError(null);
    void handleUtteranceRef.current(fullUtterance);
  };
  completeCandidateTurnRef.current = completeCandidateTurn;

  const startCandidateTurn = () => {
    if (
      !interviewActiveRef.current ||
      speakingRef.current ||
      processingLockRef.current ||
      isAiSpeaking ||
      isProcessing ||
      isTranscribing
    ) {
      return;
    }

    setSpeechInputError(null);
    setCurrentSubtitle("");
    utteranceBufferRef.current = "";
    candidateInterimRef.current = "";
    candidateTurnSubmissionPendingRef.current = false;
    candidateTurnActiveRef.current = true;
    lastRecognitionEventAtRef.current = Date.now();

    const previousRecognition = recognitionRef.current;
    if (previousRecognition) {
      try {
        previousRecognition.onend = null;
        previousRecognition.onerror = null;
        previousRecognition.stop();
      } catch (e) {}
    }

    try {
      const fresh = createRecognitionInstance();
      if (!fresh) {
        throw new Error("SpeechRecognition is not supported");
      }
      recognitionRef.current = fresh;
      fresh.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Could not start the candidate's voice turn:", error);
      candidateTurnActiveRef.current = false;
      setIsRecording(false);
      setSpeechInputError(
        language === "es"
          ? "Tu navegador no pudo iniciar el reconocimiento de voz. Revisa el permiso del micrófono e inténtalo de nuevo."
          : "Your browser could not start voice recognition. Check microphone permission and try again.",
      );
    }
  };

  const finishCandidateTurn = () => {
    if (!candidateTurnActiveRef.current) return;

    candidateTurnActiveRef.current = false;
    candidateTurnSubmissionPendingRef.current = true;
    setIsRecording(false);
    setIsTranscribing(true);

    // Some browsers deliver the last final recognition result only after stop().
    // onend submits immediately; this timeout is a fallback for broken onend events.
    candidateTurnSubmissionTimerRef.current = setTimeout(
      () => completeCandidateTurnRef.current(),
      1200,
    );

    try {
      recognitionRef.current?.stop();
    } catch (error) {
      console.warn("Could not stop SpeechRecognition cleanly:", error);
      completeCandidateTurnRef.current();
    }
  };

  // UX FIX: after Zara announces a topic change ("Ok, pasemos al siguiente
  // tema: X"), immediately ask the FIRST real question of that new topic in
  // the same automated turn — no waiting for the candidate to say anything
  // in between. Previously the transition message was a dead end: the mic
  // reopened and waited for an "answer" to what was really just an
  // announcement, which confused first-time candidates (they don't know
  // they're supposed to say something trivial just to unlock the real
  // question). This runs automatically right after syncAdvanceTopic().
  const askOpeningQuestionForTopic = async () => {
    const store = useInterviewStore.getState();
    const freshTranscript = store.transcript;
    const freshTopicIndex = store.currentTopicIndex;
    const freshTopics = store.topics;
    const freshCurrentTopic = freshTopics[freshTopicIndex];
    const freshIsLastTopic = freshTopicIndex === freshTopics.length - 1;
    const freshSessionId = store.sessionId;
    const freshTimerSeconds = store.timerSeconds;

    try {
      const allMessages = freshTranscript.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const allTopics = freshTopics.map((t, idx) => ({
        label: t.label,
        rubric: t.rubric || null,
        status:
          idx < freshTopicIndex
            ? "completed"
            : idx === freshTopicIndex
              ? "current"
              : "upcoming",
      }));

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTopic: freshCurrentTopic?.label || "",
          allTopics,
          cvData: candidate?.cvData || null,
          candidateName: candidate?.name || "",
          language: language,
          roleTitle: currentRole?.title || "Candidate",
          roleDescription: `
            ${currentRole?.description || ""}
            ${currentRole?.jobType ? `- Tipo de Puesto: ${currentRole.jobType}` : ""}
            ${currentRole?.location ? `- Ubicación: ${currentRole.location}` : ""}
            ${currentRole?.salary ? `- Salario: ${currentRole.salary}` : ""}
          `.trim(),
          recentMessages: allMessages,
          isLastTopic: freshIsLastTopic,
          interviewDuration:
            Number(currentRole?.interviewDuration) ||
            Number(useInterviewStore.getState().interviewDuration) ||
            30,
          timerSeconds: freshTimerSeconds,
          currentTopicIndex: freshTopicIndex,
          topicStartIndex: topicStartIndexRef.current,
          isClosingPhase: false,
          isGracePeriod: false,
          isOpeningPhase: false,
          sessionId: freshSessionId || "unknown-session",
        }),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);
      const data = await response.json();

      if (data.message) {
        // Defensive strip: this call's only job is to deliver the opening
        // question of the (already-advanced) topic. If the model still
        // emits a control tag here, drop it silently rather than trigger a
        // second, redundant advance/finish.
        const aiMessage = (data.message as string)
          .replace(/\[NEXT_TOPIC\]/g, "")
          .replace(/\[END_INTERVIEW\]/g, "")
          .trim();
        if (aiMessage) {
          addTranscriptEntry({
            role: "assistant",
            content: aiMessage,
            timestamp: Date.now(),
          });
          await speakText(aiMessage);
        }
      }
    } catch (error) {
      // Non-fatal: if this automated follow-up fails, the candidate can still
      // speak whenever they're ready and the normal flow picks up from there.
      console.error("askOpeningQuestionForTopic error:", error);
    }
  };

  // Start the interview
  const startInterview = async () => {
    // Bug 9 fix: generate the sessionId synchronously BEFORE the opening API
    // call so the very first telemetry row has the real session id and is
    // tied to the rest of the interview.
    const existingSessionId = useInterviewStore.getState().sessionId;
    const guaranteedSessionId =
      existingSessionId || publicResultId || `cand-${Date.now()}`;
    if (!existingSessionId) setSessionId(guaranteedSessionId);

    try {
      // Explicit echo/noise constraints (most browsers default to these, but
      // some devices/platforms don't) — reduces the chance of Zara's own
      // voice leaking back into the mic through the speakers.
      const audioConstraints: MediaTrackConstraints = selectedMicId
        ? {
            deviceId: { exact: selectedMicId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
      const stream = await navigator.mediaDevices.getUserMedia({
        // Constrain camera to 360p/15–20fps for both preview and recording.
        // This significantly reduces CPU/GPU load on low-power machines while
        // still providing sufficient quality for facial expressions and gestures.
        // Screen share (screenStream) is unaffected — it uses its own track.
        video: selectedCameraId
          ? {
              deviceId: { exact: selectedCameraId },
              width: { ideal: 640, max: 854 },
              height: { ideal: 360, max: 480 },
              frameRate: { ideal: 15, max: 20 },
            }
          : {
              width: { ideal: 640, max: 854 },
              height: { ideal: 360, max: 480 },
              frameRate: { ideal: 15, max: 20 },
            },
        audio: audioConstraints,
      });
      streamRef.current = stream;
      setMediaError(null);

      // Media acquired successfully — NOW transition to interview UI
      setHasStarted(true);
      setIsAiSpeaking(true);
      interviewActiveRef.current = true; // Enable auto-restart for SpeechRecognition

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
        // Prefer VP8/Opus for lower CPU cost vs VP9 on older/weaker hardware.
        // Fall back to the browser default if the codec pair is not supported.
        const recorderOptions: MediaRecorderOptions = MediaRecorder.isTypeSupported(
          'video/webm;codecs=vp8,opus'
        )
          ? { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 500_000 }
          : { mimeType: 'video/webm' };

        const mediaRecorder = new MediaRecorder(recordingStream, recorderOptions);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        // Collect chunks every 5s instead of every 1s — reduces ondataavailable
        // event frequency 5× without affecting the final recording quality.
        mediaRecorder.start(5000);
      } catch (e) {
        console.error("MediaRecorder error:", e);
      }

      // Setup Audio Analyser for the bottom widget
      const audioCtx = new AudioContext();
      // Save to ref so we can close it in endInterview() and component cleanup.
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      // Throttled volume loop: fire at most ~10 fps and only update state when
      // the level changes by more than 3% — avoids up to 60 setState/s.
      const updateVolume = (now: number) => {
        if (now - lastVolUpdateRef.current > 100) {
          analyser.getByteFrequencyData(dataArray);
          const next = Math.max(...dataArray) / 255;
          if (Math.abs(next - lastVolValueRef.current) > 0.03) {
            setVolumeLevel(next);
            lastVolValueRef.current = next;
          }
          lastVolUpdateRef.current = now;
        }
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      animationRef.current = requestAnimationFrame(updateVolume);
    } catch (err) {
      console.error("Media error:", err);
      const error = err as DOMException;
      if (
        error?.name === "NotAllowedError" ||
        error?.name === "PermissionDeniedError"
      ) {
        setMediaError(
          language === "es"
            ? "Acceso a cámara/micrófono denegado. Permite los permisos en tu navegador y recarga."
            : "Camera/microphone access denied. Please allow permissions in your browser and reload.",
        );
      } else {
        setMediaError(
          language === "es"
            ? "No se pudo acceder a la cámara o micrófono. Verifica tus dispositivos."
            : "Could not access camera or microphone. Please check your devices.",
        );
      }
      // Do NOT proceed — user stays on pre-interview screen and sees the error
      return;
    }

    // Start timer
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    // Also ensure roleId is in the interview store for InterviewComplete
    setStoreRoleId(roleId);

    // Request AI-generated professional opening (instead of hardcoded greeting)
    try {
      const allTopicsPayload = topics.map((t, idx) => ({
        label: t.label,
        rubric: t.rubric || null,
        status: idx === 0 ? "current" : "upcoming",
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTopic: topics[0]?.label || "",
          allTopics: allTopicsPayload,
          cvData: candidate?.cvData || null,
          candidateName: candidate?.name || "",
          language: language,
          roleTitle: currentRole?.title || "Candidate",
          roleDescription: `
            ${currentRole?.description || ""}
            ${currentRole?.jobType ? `- Tipo de Puesto: ${currentRole.jobType}` : ""}
            ${currentRole?.location ? `- Ubicación: ${currentRole.location}` : ""}
            ${currentRole?.salary ? `- Salario: ${currentRole.salary}` : ""}
          `.trim(),
          recentMessages: [], // No messages yet — opening phase
          isLastTopic: topics.length <= 1,
          interviewDuration:
            Number(currentRole?.interviewDuration) ||
            Number(useInterviewStore.getState().interviewDuration) ||
            30,
          timerSeconds: 0,
          currentTopicIndex: 0,
          topicStartIndex: 0,
          isClosingPhase: false,
          isOpeningPhase: true, // Signal the API this is the opening
          sessionId: guaranteedSessionId,
        }),
      });

      const data = await response.json();
      if (data.message) {
        let aiGreeting = data.message;
        // Clean any control tags from the opening
        aiGreeting = aiGreeting
          .replace(/\[NEXT_TOPIC\]/g, "")
          .replace(/\[END_INTERVIEW\]/g, "")
          .trim();

        addTranscriptEntry({
          role: "assistant",
          content: aiGreeting,
          timestamp: Date.now(),
        });
        await speakText(aiGreeting);
      } else {
        // Fallback if AI fails
        const fallbackGreeting =
          language === "es"
            ? `Hola ${candidate.name}, soy Zara, tu entrevistadora para el puesto de ${currentRole?.title}. Esta entrevista durará aproximadamente ${interviewDurationMins} minutos. Comencemos. Cuéntame sobre tu experiencia en ${topics[0]?.label || "esta área"}.`
            : `Hi ${candidate.name}, I'm Zara, your interviewer for the ${currentRole?.title} position. This interview will take approximately ${interviewDurationMins} minutes. Let's begin. Tell me about your experience in ${topics[0]?.label || "this area"}.`;
        addTranscriptEntry({
          role: "assistant",
          content: fallbackGreeting,
          timestamp: Date.now(),
        });
        await speakText(fallbackGreeting);
      }
    } catch (error) {
      console.error("Opening greeting error:", error);
      // Fallback greeting
      const fallbackGreeting =
        language === "es"
          ? `Hola ${candidate.name}, soy Zara. Comencemos la entrevista para el puesto de ${currentRole?.title}. Cuéntame sobre tu experiencia en ${topics[0]?.label || "esta área"}.`
          : `Hi ${candidate.name}, I'm Zara. Let's begin the interview for the ${currentRole?.title} position. Tell me about your experience in ${topics[0]?.label || "this area"}.`;
      addTranscriptEntry({
        role: "assistant",
        content: fallbackGreeting,
        timestamp: Date.now(),
      });
      await speakText(fallbackGreeting);
    }
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

      candidateTurnActiveRef.current = false;
      setIsRecording(false);
      setIsAiSpeaking(true);
      setCurrentSubtitle(text);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
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
        setCurrentSubtitle("");
        // The microphone remains closed. The candidate decides when to open
        // the next turn after Zara has completely finished speaking.
        setIsRecording(false);
        resolve();
      };

      // SAFETY NET: If TTS hasn't finished after 35 seconds, force-resolve.
      // This prevents the interview from getting permanently stuck. (Lowered
      // from 60s, but kept generous enough for longer spoken answers — the
      // fetch-level timeout below already handles the common "API/network
      // hung" case much faster, so this is now truly a last-resort net for
      // the rare case where audio plays but its `onended` event never fires.)
      ttsTimeoutRef.current = setTimeout(() => {
        console.warn("TTS safety timeout triggered — forcing speech end");
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (synthesisRef.current) {
          synthesisRef.current.cancel();
        }
        onFinishSpeaking();
      }, 35000);

      // Bound the TTS fetch itself so a hung network/API call falls back to
      // browser speech instead of silently stalling the interview. Set just
      // above the server's own 25s upstream timeout (see /api/tts) so we
      // never abort a request that the server was about to finish/handle
      // gracefully on its own.
      const ttsController = new AbortController();
      const ttsFetchTimeout = setTimeout(() => ttsController.abort(), 28000);

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
        signal: ttsController.signal,
      })
        .then((response) => {
          clearTimeout(ttsFetchTimeout);
          console.log(
            "[TTS-FE] fetch status:",
            response.status,
            "ok:",
            response.ok,
          );
          if (response.ok) {
            return response.blob();
          }
          throw new Error(`TTS failed with status ${response.status}`);
        })
        .then((audioBlob) => {
          console.log(
            "[TTS-FE] blob received — size:",
            audioBlob.size,
            "type:",
            audioBlob.type,
          );
          if (audioBlob.size === 0) {
            console.warn("[TTS-FE] Empty audio blob — falling back");
            throw new Error("Empty audio blob");
          }
          // Revoke any previous object URL before creating a new one —
          // prevents silent memory accumulation across questions.
          if (currentAudioUrlRef.current) {
            URL.revokeObjectURL(currentAudioUrlRef.current);
          }
          const audioUrl = URL.createObjectURL(audioBlob);
          currentAudioUrlRef.current = audioUrl;
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.onended = () => {
            console.log("[TTS-FE] Audio playback ended normally");
            URL.revokeObjectURL(audioUrl);
            if (currentAudioUrlRef.current === audioUrl) currentAudioUrlRef.current = null;
            onFinishSpeaking();
          };
          audio.onerror = (e) => {
            console.warn(
              "[TTS-FE] Audio element error — falling back to browser speech",
              e,
            );
            URL.revokeObjectURL(audioUrl);
            if (currentAudioUrlRef.current === audioUrl) currentAudioUrlRef.current = null;
            fallbackSpeech(text, onFinishSpeaking);
          };
          audio
            .play()
            .then(() =>
              console.log("[TTS-FE] Audio play() started successfully"),
            )
            .catch((err) => {
              console.warn(
                "[TTS-FE] Audio play() rejected:",
                err,
                "— falling back",
              );
              URL.revokeObjectURL(audioUrl);
              if (currentAudioUrlRef.current === audioUrl) currentAudioUrlRef.current = null;
              fallbackSpeech(text, onFinishSpeaking);
            });
        })
        .catch((err) => {
          clearTimeout(ttsFetchTimeout);
          console.warn(
            "[TTS-FE] fetch/blob error:",
            err,
            "— falling back to browser speech",
          );
          fallbackSpeech(text, onFinishSpeaking);
        });
    });
  };

  const fallbackSpeech = (text: string, onDone: () => void) => {
    if (!synthesisRef.current) {
      console.warn("[TTS-FE] No SpeechSynthesis — calling onDone");
      onDone();
      return;
    }
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = synthesisRef.current.getVoices();
    const preferredVoice =
      voices.find(
        (v) => v.lang.startsWith(language) && v.name.includes("Google"),
      ) || voices.find((v) => v.lang.startsWith(language));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    console.log(
      "[TTS-FE] fallbackSpeech — voice:",
      preferredVoice?.name || "default",
      "lang:",
      langCode,
    );

    utterance.onend = () => {
      console.log("[TTS-FE] fallbackSpeech ended normally");
      onDone();
    };
    utterance.onerror = (e) => {
      console.error("[TTS-FE] fallbackSpeech error:", e);
      onDone();
    };
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
    interviewActiveRef.current = false;
    candidateTurnActiveRef.current = false;
    candidateTurnSubmissionPendingRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
    if (candidateTurnSubmissionTimerRef.current) {
      clearTimeout(candidateTurnSubmissionTimerRef.current);
      candidateTurnSubmissionTimerRef.current = null;
    }
    if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
    if (synthesisRef.current) synthesisRef.current.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Revoke any live TTS object URL to free memory.
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    // Close the AudioContext created in startInterview.
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {}
    }

    // Force-clear stuck state
    speakingRef.current = false;
    processingLockRef.current = false;
    utteranceBufferRef.current = "";
    candidateInterimRef.current = "";
    setIsAiSpeaking(false);
    setIsProcessing(false);
    setIsRecording(false);
    setIsTranscribing(false);
    setProcessingTooLong(false);
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }

    // Save duration
    localStorage.setItem("tempDuration", timerSeconds.toString());

    // CRITICAL: Force-save transcript to admin store before transitioning
    // This ensures data is persisted even if InterviewComplete fails
    const currentSessionId =
      sessionId || publicResultId || `cand-${Date.now()}`;
    if (!sessionId) setSessionId(currentSessionId);

    const exists = candidates.find((c) => c.id === currentSessionId);
    if (exists) {
      updateCandidate(currentSessionId, {
        transcript,
        duration: timerSeconds,
        status: "in-progress", // Will be updated to 'completed' by InterviewComplete
      });
    } else {
      addCandidate({
        id: currentSessionId,
        candidate,
        roleId,
        roleTitle: currentRole?.title || "Candidate",
        date: Date.now(),
        status: "in-progress",
        transcript,
        duration: timerSeconds,
        source: publicResultId ? "public_link" : "ticket",
      });
    }

    // Stop recording and upload
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "video/webm",
        });
        // Free the chunk RAM immediately after creating the blob — prevents
        // accumulated video data from lingering in memory post-interview.
        recordedChunksRef.current = [];

        // Temporary in-session fallback — valid only while this tab is open.
        // Will be replaced by the permanent R2 URL below if the upload succeeds.
        const localUrl = URL.createObjectURL(blob);
        localStorage.setItem("tempVideoUrl", localUrl);

        try {
          const filename = `recording-${sessionId || Date.now()}.webm`;
          const contentType = "video/webm";

          // Step 1 – ask the API for a presigned PUT URL (tiny JSON, well within Vercel limits)
          const presignRes = await fetch("/api/upload-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, contentType }),
          });

          if (!presignRes.ok) {
            throw new Error(`Presign request failed: ${presignRes.status}`);
          }

          const { uploadUrl, publicUrl } = (await presignRes.json()) as {
            uploadUrl: string;
            publicUrl: string;
          };

          // Step 2 – PUT the blob directly to R2 (bypasses Vercel entirely)
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: blob,
          });

          if (!uploadRes.ok) {
            throw new Error(`R2 PUT failed: ${uploadRes.status}`);
          }

          // Replace ephemeral blob: URL with the permanent R2 public URL
          localStorage.setItem("tempVideoUrl", publicUrl);
        } catch (e) {
          console.error(
            "R2 Upload failed, keeping local blob URL for this session",
            e,
          );
          // localUrl is still in localStorage — video will work for the current tab only
        }

        // Stop camera and screen tracks
        if (videoRef.current?.srcObject) {
          const tracks = (
            videoRef.current.srcObject as MediaStream
          ).getTracks();
          tracks.forEach((track) => track.stop());
        }
        if (screenStream) {
          screenStream.getTracks().forEach((track) => track.stop());
        }
        setPhase("complete");
      };
      mediaRecorderRef.current.stop();
    } else {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
      setPhase("complete");
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      interviewActiveRef.current = false;
      candidateTurnActiveRef.current = false;
      candidateTurnSubmissionPendingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
      if (candidateTurnSubmissionTimerRef.current)
        clearTimeout(candidateTurnSubmissionTimerRef.current);
      if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
      if (watchdogIntervalRef.current)
        clearInterval(watchdogIntervalRef.current);
      if (synthesisRef.current) synthesisRef.current.cancel();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      // Release AudioContext and any lingering TTS object URL on unmount.
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
    };
  }, []);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Detect low-power hardware and activate performance mode for AiOrb.
  // Blur-animated rings are skipped, cutting GPU/CPU load significantly on
  // machines with ≤4 CPU cores or ≤4 GB RAM.
  const performanceMode =
    typeof navigator !== 'undefined' &&
    (
      (navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 4) ||
      ((navigator as any).deviceMemory != null && (navigator as any).deviceMemory <= 4)
    );

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
                <div
                  key={topic.id}
                  className="flex flex-col items-center gap-2"
                >
                  <span
                    className={`text-xs font-medium tracking-wide transition-colors ${
                      isActive
                        ? "text-primary"
                        : isPast
                          ? "text-primary/60"
                          : "text-muted/50"
                    }`}
                  >
                    {topic.label.length > 20
                      ? topic.label.substring(0, 20) + "..."
                      : topic.label}
                  </span>
                  <div
                    className={`h-0.5 rounded-full transition-all duration-500 ${
                      isActive
                        ? "w-24 bg-primary"
                        : isPast
                          ? "w-16 bg-primary/40"
                          : "w-16 bg-black/10"
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
              {language === "es" ? "Terminar Anticipadamente" : "End Early"}
            </button>
            {/* Countdown Timer with color-coded alerts */}
            {(() => {
              const remaining = Math.max(
                0,
                totalDurationSeconds - timerSeconds,
              );
              const remainPct =
                totalDurationSeconds > 0 ? remaining / totalDurationSeconds : 1;
              const isUrgent = !isGracePeriod && remainPct <= 0.1; // last 10%
              const isWarning = !isGracePeriod && remainPct <= 0.25; // last 25%
              const timerColor = isGracePeriod
                ? "text-warning"
                : isUrgent
                  ? "text-danger"
                  : isWarning
                    ? "text-warning"
                    : "text-primary";
              const borderColor = isGracePeriod
                ? "border-warning/30"
                : isUrgent
                  ? "border-danger/30"
                  : isWarning
                    ? "border-warning/30"
                    : "border-black/[0.04]";
              const iconColor = isGracePeriod
                ? "text-warning"
                : isUrgent
                  ? "text-danger"
                  : isWarning
                    ? "text-warning"
                    : "text-primary";
              // In grace mode, show how much extra time has been spent rather than
              // a negative countdown.
              const extraSeconds = Math.max(
                0,
                timerSeconds - totalDurationSeconds,
              );
              return (
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border ${borderColor} transition-colors`}
                >
                  <Clock
                    className={`h-4 w-4 ${iconColor} ${isUrgent ? "animate-pulse" : ""}`}
                  />
                  <div className="flex flex-col items-end">
                    <span
                      className={`text-sm font-semibold ${timerColor} tracking-tight tabular-nums`}
                    >
                      {isGracePeriod
                        ? `+${formatTime(extraSeconds)}`
                        : formatTime(remaining)}
                    </span>
                    <span className="text-[10px] text-muted/50 leading-none">
                      {isGracePeriod
                        ? language === "es"
                          ? "Tiempo extendido"
                          : "Extended time"
                        : `${formatTime(timerSeconds)} / ${formatTime(totalDurationSeconds)}`}
                    </span>
                  </div>
                </div>
              );
            })()}
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
            <AiOrb isSpeaking={isAiSpeaking} isProcessing={isProcessing} performanceMode={performanceMode} />
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
                <li
                  key={idx}
                  className="flex gap-3 text-sm text-muted/90 leading-relaxed"
                >
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
            {mediaError && (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{mediaError}</p>
              </div>
            )}
          </motion.div>
        ) : (
          /* === TWO-COLUMN LAYOUT: Orb Left | Chat Right === */
          <div className="relative z-10 w-full h-full flex">
            {/* LEFT COLUMN: Orb + Camera */}
            <div className="w-[40%] h-full flex flex-col items-center justify-center relative">
              <div className="pointer-events-none">
                <AiOrb isSpeaking={isAiSpeaking} isProcessing={isProcessing} performanceMode={performanceMode} />
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
                    <span className="text-xs font-medium text-foreground">
                      {t.micDefault}
                    </span>
                  </div>
                  <div className="flex items-end gap-0.5 h-3 pr-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 rounded-full transition-all duration-75"
                        style={{
                          height: `${Math.min(100, Math.max(30, volumeLevel * 100 * (1 + (i % 5) * 0.1)))}%`,
                          backgroundColor:
                            volumeLevel > 0.05
                              ? "var(--color-primary)"
                              : "#e2e8f0",
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

              {/* CV Loaded Indicator */}
              {candidate?.cvData && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-success/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-medium text-success">
                    {language === "es" ? "CV Cargado" : "CV Loaded"}
                  </span>
                </motion.div>
              )}
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
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="flex flex-col items-start max-w-lg">
                          <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider block mb-1 ml-1">
                            Zara
                          </span>
                          <p className="text-base font-medium text-foreground leading-snug tracking-tight bg-white/80 px-5 py-3 rounded-2xl rounded-tl-sm backdrop-blur-md shadow-sm border border-white/60">
                            {msg.content}
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end max-w-lg">
                          <span className="text-xs font-semibold text-muted/70 uppercase tracking-wider block mb-1 mr-1">
                            {t.you || "You"}
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
                        {t.you || "You"} ...
                      </span>
                      <p className="text-base font-medium text-white/90 leading-snug tracking-tight bg-primary/80 px-5 py-3 rounded-2xl rounded-tr-sm shadow-sm border border-primary/50 italic max-w-lg">
                        {currentSubtitle}
                      </p>
                    </motion.div>
                  )}

                  {/* Live AI TTS */}
                  {currentSubtitle &&
                    isAiSpeaking &&
                    !transcript.some((t) => t.content === currentSubtitle) && (
                      <motion.div
                        key="interim-ai"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-start"
                      >
                        <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider block mb-1 ml-1">
                          Zara
                        </span>
                        <p className="text-base font-medium text-foreground leading-snug tracking-tight bg-white/80 px-5 py-3 rounded-2xl rounded-tl-sm backdrop-blur-md shadow-sm border border-white/60 animate-pulse max-w-lg">
                          {currentSubtitle}
                        </p>
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>

              {/* Manual voice control — the candidate owns the full duration of each answer. */}
              <div className="flex flex-col items-start gap-2 mb-3">
                <button
                  type="button"
                  onClick={isRecording ? finishCandidateTurn : startCandidateTurn}
                  disabled={!isRecording && (isAiSpeaking || isProcessing || isTranscribing)}
                  className={`min-w-[250px] inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-full text-sm font-semibold text-white shadow-lg transition-all focus:outline-none focus-visible:ring-4 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none ${
                    isRecording
                      ? "bg-danger hover:bg-danger/90 shadow-danger/20 focus-visible:ring-danger/20"
                      : isAiSpeaking || isProcessing || isTranscribing
                        ? "bg-slate-400/70"
                        : "bg-primary hover:bg-primary-hover shadow-primary/25 focus-visible:ring-primary/20"
                  }`}
                  aria-pressed={isRecording}
                >
                  {isRecording ? (
                    <>
                      <Square className="h-4 w-4 fill-current" />
                      {language === "es" ? "Terminar respuesta" : "Finish answer"}
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      {isAiSpeaking
                        ? language === "es"
                          ? "Zara está hablando"
                          : "Zara is speaking"
                        : isProcessing || isTranscribing
                          ? language === "es"
                            ? "Procesando respuesta"
                            : "Processing answer"
                          : language === "es"
                            ? "Pulsa para hablar"
                            : "Press to speak"}
                    </>
                  )}
                </button>
                <p className={`text-xs font-medium ${isRecording ? "text-danger" : "text-muted"}`}>
                  {isRecording
                    ? language === "es"
                      ? "Habla con libertad. Los silencios no detendrán tu respuesta; pulsa el botón cuando termines."
                      : "Speak freely. Pauses will not stop your answer; press the button when you finish."
                    : isAiSpeaking
                      ? language === "es"
                        ? "Espera a que Zara termine para abrir tu micrófono."
                        : "Wait for Zara to finish before opening your microphone."
                      : isProcessing || isTranscribing
                        ? language === "es"
                          ? "Estamos enviando tu intervención completa a Zara."
                          : "We are sending your complete answer to Zara."
                        : language === "es"
                          ? "Tú decides cuándo empieza y termina cada intervención."
                          : "You decide when each answer starts and ends."}
                </p>
                {speechInputError && (
                  <div className="flex items-start gap-2 text-xs font-medium text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 max-w-lg">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{speechInputError}</span>
                  </div>
                )}
              </div>

              {/* Status Pill */}
              <AnimatePresence>
                {(isRecording ||
                  isProcessing ||
                  isAiSpeaking ||
                  isTranscribing) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="self-start flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-black/[0.04]"
                  >
                    {isTranscribing && !isProcessing && !isAiSpeaking ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                        <span className="text-xs font-semibold text-warning uppercase tracking-wider">
                          {language === "es"
                            ? "Transcribiendo..."
                            : "Transcribing..."}
                        </span>
                      </>
                    ) : isRecording ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                        <span className="text-xs font-semibold text-danger uppercase tracking-wider">
                          {t.recordingPill}
                        </span>
                      </>
                    ) : isProcessing ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                          {processingTooLong
                            ? language === "es"
                              ? "Tardando más de lo normal..."
                              : "Taking longer than usual..."
                            : t.processingPill}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                          {t.waitingPill}
                        </span>
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
