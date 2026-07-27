"use client";

import {
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";

interface GroupQuestion {
  topic: string;
  question: string;
}

interface GroupInterviewData {
  roleId: string;
  roleTitle: string;
  interviewDuration: number;
  questions: GroupQuestion[];
}

type SessionStatus =
  | "ready"
  | "loading"
  | "active"
  | "finished"
  | "error";

export default function GroupInterviewPage({
  params,
}: {
  params: Promise<{
    roleId: string;
  }>;
}) {
  const { roleId } = use(params);
  const { language } = useAppStore();
  const es = language === "es";

  const [status, setStatus] =
    useState<SessionStatus>("ready");
  const [sessionData, setSessionData] =
    useState<GroupInterviewData | null>(
      null,
    );
  const [questionIndex, setQuestionIndex] =
    useState(0);
  const [elapsedSeconds, setElapsedSeconds] =
    useState(0);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const timerRef =
    useRef<NodeJS.Timeout | null>(null);
  const lastAdvanceRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();

    timerRef.current = setInterval(() => {
      setElapsedSeconds(
        (previous) => previous + 1,
      );
    }, 1000);
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const startSession = async () => {
    if (status === "loading") return;

    setStatus("loading");
    setErrorMessage(null);
    setQuestionIndex(0);
    setElapsedSeconds(0);

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      35000,
    );

    try {
      const response = await fetch(
        "/api/group-interview/questions",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            roleId,
            language,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);

        throw new Error(
          errorData?.error ||
            `Request failed with status ${response.status}`,
        );
      }

      const data =
        (await response.json()) as GroupInterviewData;

      if (
        !data ||
        !Array.isArray(data.questions) ||
        data.questions.length === 0
      ) {
        throw new Error(
          "No interview questions were generated",
        );
      }

      setSessionData(data);
      setStatus("active");
      startTimer();
    } catch (error) {
      console.error(
        "Group interview start error:",
        error,
      );

      const timedOut =
        error instanceof Error &&
        error.name === "AbortError";

      setErrorMessage(
        timedOut
          ? es
            ? "La generación de preguntas tardó demasiado. Inténtalo nuevamente."
            : "Question generation took too long. Please try again."
          : error instanceof Error
            ? error.message
            : es
              ? "No se pudieron generar las preguntas."
              : "The questions could not be generated.",
      );

      setStatus("error");
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleReady = () => {
    if (
      status !== "active" ||
      !sessionData
    ) {
      return;
    }

    const now = Date.now();

    if (
      now - lastAdvanceRef.current < 500
    ) {
      return;
    }

    lastAdvanceRef.current = now;

    const isLastQuestion =
      questionIndex >=
      sessionData.questions.length - 1;

    if (isLastQuestion) {
      clearTimer();
      setStatus("finished");
      return;
    }

    setQuestionIndex(
      (previous) => previous + 1,
    );
  };

  const restartSameQuestions = () => {
    setQuestionIndex(0);
    setElapsedSeconds(0);
    setStatus("active");
    lastAdvanceRef.current = 0;
    startTimer();
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(
      seconds / 60,
    );

    const remainingSeconds =
      seconds % 60;

    return `${String(minutes).padStart(
      2,
      "0",
    )}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  };

  if (
    status === "ready" ||
    status === "loading" ||
    status === "error"
  ) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#eef2ff] flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-3xl bg-white border border-black/5 shadow-xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Users className="h-7 w-7 text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es
              ? "Entrevista grupal presencial"
              : "In-person group interview"}
          </h1>

          <p className="text-sm text-muted leading-relaxed mb-6">
            {es
              ? "Zara mostrará una pregunta a la vez. Todas las personas responderán en papel y el moderador pulsará el botón cuando el grupo termine."
              : "Zara will display one question at a time. Everyone will answer on paper and the moderator will press the button when the group is finished."}
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-background border border-border/50">
              <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted leading-relaxed">
                {es
                  ? "No se escribirán respuestas en la computadora y ninguna respuesta será enviada a Zara."
                  : "No answers will be entered on the computer and no answers will be sent to Zara."}
              </p>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-background border border-border/50">
              <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
              <p className="text-xs text-muted leading-relaxed">
                {es
                  ? "No se utilizarán cámara, micrófono, grabación, pantalla compartida ni evaluación individual."
                  : "Camera, microphone, recording, screen sharing and individual evaluation will not be used."}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mb-5 p-4 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/admin/create-role"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted/10"
            >
              <ArrowLeft className="h-4 w-4" />
              {es ? "Volver" : "Back"}
            </Link>

            <button
              type="button"
              onClick={startSession}
              disabled={status === "loading"}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-wait"
            >
              {status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status === "error" ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}

              {status === "loading"
                ? es
                  ? "Zara está preparando las preguntas..."
                  : "Zara is preparing the questions..."
                : status === "error"
                  ? es
                    ? "Reintentar"
                    : "Retry"
                  : es
                    ? "Generar preguntas e iniciar"
                    : "Generate questions and start"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (
    status === "finished" &&
    sessionData
  ) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#eef2ff] flex items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-3xl bg-white border border-black/5 shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es
              ? "Sesión finalizada"
              : "Session completed"}
          </h1>

          <p className="text-sm text-muted leading-relaxed mb-2">
            {es
              ? "Zara terminó de presentar todas las preguntas."
              : "Zara has finished presenting all questions."}
          </p>

          <p className="text-xs text-muted mb-8">
            {sessionData.questions.length}{" "}
            {es ? "preguntas" : "questions"} ·{" "}
            {formatTime(elapsedSeconds)}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={restartSameQuestions}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted/10"
            >
              <RefreshCw className="h-4 w-4" />
              {es
                ? "Repetir mismas preguntas"
                : "Repeat same questions"}
            </button>

            <Link
              href="/admin/create-role"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              {es
                ? "Volver a puestos"
                : "Back to roles"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (
    !sessionData ||
    status !== "active"
  ) {
    return null;
  }

  const currentQuestion =
    sessionData.questions[questionIndex];

  const progress =
    ((questionIndex + 1) /
      sessionData.questions.length) *
    100;

  const isLastQuestion =
    questionIndex ===
    sessionData.questions.length - 1;

  return (
    <div className="fixed inset-0 z-[100] bg-[#eef2ff] flex flex-col">
      <header className="h-20 px-8 bg-white/80 backdrop-blur border-b border-black/5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
            Zara ·{" "}
            {es
              ? "Guía grupal"
              : "Group guide"}
          </p>

          <h1 className="text-lg font-bold text-foreground">
            {sessionData.roleTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-border shadow-sm">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tabular-nums">
            {formatTime(elapsedSeconds)}
          </span>
        </div>
      </header>

      <div className="h-1.5 bg-black/5">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <main className="flex-1 flex items-center justify-center px-8 py-10">
        <div className="w-full max-w-5xl">
          <div className="flex items-center justify-between mb-5">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold">
              {currentQuestion.topic}
            </span>

            <span className="text-sm font-medium text-muted">
              {es
                ? `Pregunta ${questionIndex + 1} de ${sessionData.questions.length}`
                : `Question ${questionIndex + 1} of ${sessionData.questions.length}`}
            </span>
          </div>

          <div
            key={questionIndex}
            className="bg-white rounded-[32px] border border-black/5 shadow-xl px-10 py-14 min-h-[320px] flex items-center justify-center"
          >
            <p className="text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground text-center leading-tight">
              {currentQuestion.question}
            </p>
          </div>

          <div className="mt-6 bg-white rounded-2xl border border-primary/20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                {es
                  ? "Control del moderador"
                  : "Moderator control"}
              </p>
            </div>

            <p className="text-xs text-muted leading-relaxed mb-4">
              {es
                ? "Cuando todas las personas hayan terminado de escribir esta respuesta en papel, pulsa el botón."
                : "When everyone has finished writing their answer to this question on paper, press the button."}
            </p>

            <button
              type="button"
              onClick={handleReady}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-primary text-white text-base font-bold hover:bg-primary-hover active:scale-[0.99] transition-all"
            >
              {isLastQuestion ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <ArrowRight className="h-5 w-5" />
              )}

              {isLastQuestion
                ? es
                  ? "Listo, finalizar sesión"
                  : "Ready, finish session"
                : es
                  ? "Listo, siguiente pregunta"
                  : "Ready, next question"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
