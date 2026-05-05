/**
 * InterviewTimingEngine — Pure TypeScript module for intelligent interview pacing.
 *
 * Replaces hardcoded "seconds per question" formulas with a data-driven system
 * that accounts for TTS overhead, API latency, candidate response times,
 * greeting/closing overhead, topic transitions, question types, and CV verification.
 *
 * Zero dependencies — no React, no Next.js, no external packages.
 */

// ─── Timing Constants (measured from real interview sessions) ───

export interface TimingConstants {
  /** TTS audio generation + playback per Zara response (seconds) */
  ttsOverheadSec: number;
  /** AI response generation latency (seconds) */
  apiLatencySec: number;
  /** Speech recognition debounce/processing delay (seconds) */
  speechRecDelaySec: number;
  /** Zara's acknowledgment + question audio (seconds) */
  acknowledgmentSec: number;
  /** Candidate response time for technical questions (seconds) */
  candidateResponseTechnicalSec: number;
  /** Candidate response time for behavioral/STAR questions (seconds) */
  candidateResponseBehavioralSec: number;
  /** Candidate response time for short/verification questions (seconds) */
  candidateResponseVerificationSec: number;
}

export const DEFAULT_TIMING: TimingConstants = {
  ttsOverheadSec: 12,               // avg 8-15s
  apiLatencySec: 3,                  // avg 2-5s
  speechRecDelaySec: 1.5,           // 1-2s debounce
  acknowledgmentSec: 4,             // 3-6s audio
  candidateResponseTechnicalSec: 45, // 30-60s
  candidateResponseBehavioralSec: 65,// 45-90s
  candidateResponseVerificationSec: 22, // 15-30s
};

// ─── Input / Output Types ───

export interface TopicInput {
  label: string;
  /** Weight from rubric (1-10). Higher = more time/questions. Default: 5 */
  weight: number;
  /** Hint for expected question type. Affects cycle duration estimate. */
  questionType?: 'technical' | 'behavioral' | 'verification' | 'mixed';
}

export interface TimingOptions {
  /** Whether the candidate uploaded a CV (adds ~40% verification questions with extra overhead) */
  hasCv?: boolean;
  /** Interview language — currently informational only */
  language?: 'es' | 'en';
}

export interface TopicBudget {
  label: string;
  weight: number;
  /** Seconds allocated to this topic */
  allocatedSeconds: number;
  /** Number of questions the interviewer should ask on this topic */
  questionBudget: number;
  /** Estimated seconds per question cycle for this topic */
  questionCycleSec: number;
}

export interface PaceConfig {
  /** Human-readable pace instruction for the LLM system prompt */
  label: string;
  /** Question style: 'concise' (≤15m), 'standard' (16-45m), 'deep' (>45m) */
  questionStyle: 'concise' | 'standard' | 'deep';
  /** Suggested max tokens for the AI response */
  maxTokensHint: number;
  /** Suggested acknowledgment length before the next question */
  acknowledgmentLength: 'minimal' | 'brief' | 'normal';
}

export interface InterviewPlan {
  /** Total interview duration in minutes */
  totalMinutes: number;
  /** Seconds reserved for greeting */
  greetingOverheadSec: number;
  /** Seconds reserved for closing */
  closingOverheadSec: number;
  /** Seconds reserved for all topic transitions */
  transitionOverheadSec: number;
  /** Total usable seconds for actual Q&A */
  usableSeconds: number;
  /** Per-topic breakdown */
  topics: TopicBudget[];
  /** Total questions across all topics */
  totalQuestions: number;
  /** Pacing configuration for the LLM */
  paceConfig: PaceConfig;
}

export interface RealTimePacing {
  /** Whether the interview is roughly on track */
  onTrack: boolean;
  /** Suggest adding N extra questions to the current topic (candidate answering fast) */
  suggestAddQuestions: number;
  /** Suggest skipping N questions from the current topic (running behind) */
  suggestSkipQuestions: number;
  /** Urgency level for the LLM prompt */
  urgency: 'relaxed' | 'normal' | 'hurry' | 'critical';
  /** Descriptive message for the LLM */
  message: string;
}

// ─── Overhead Calculators ───

function getGreetingOverhead(totalMinutes: number): number {
  if (totalMinutes <= 15) return 45;   // ~0.75 min
  if (totalMinutes <= 45) return 60;   // ~1.0 min
  return 90;                           // ~1.5 min
}

function getClosingOverhead(totalMinutes: number): number {
  if (totalMinutes <= 15) return 20;   // ~0.33 min
  if (totalMinutes <= 45) return 30;   // ~0.5 min
  return 45;                           // ~0.75 min
}

function getTransitionOverhead(totalMinutes: number, numTopics: number): number {
  const perTransition = totalMinutes <= 15 ? 12 : 18; // seconds
  return Math.max(0, numTopics - 1) * perTransition;
}

// ─── Question Cycle Duration ───

/**
 * Computes the estimated duration of one "question cycle":
 * TTS overhead + API latency + candidate response + speech rec delay + acknowledgment
 *
 * This varies by interview length (shorter = more overhead-dominant)
 * and question type.
 */
function getBaseQuestionCycle(totalMinutes: number): number {
  // In short interviews, TTS and latency consume a larger fraction.
  // In long interviews, candidates relax and answer more naturally.
  if (totalMinutes <= 10) return 80;
  if (totalMinutes <= 15) return 75;
  if (totalMinutes <= 30) return 70;
  if (totalMinutes <= 45) return 65;
  if (totalMinutes <= 60) return 65;
  return 60; // 90+ min: relaxed pace
}

/**
 * Adjusts cycle duration based on the expected question type for a topic.
 * Behavioral/STAR questions take longer; verification questions are faster.
 */
function adjustCycleForQuestionType(
  baseCycle: number,
  questionType: TopicInput['questionType']
): number {
  switch (questionType) {
    case 'behavioral':
      return baseCycle + 15; // STAR responses take longer
    case 'verification':
      return baseCycle - 15; // Quick confirmation questions
    case 'technical':
      return baseCycle;      // Baseline
    case 'mixed':
    default:
      return baseCycle;      // Average
  }
}

/**
 * CV verification overhead: 40% of questions trigger CV probing,
 * adding ~15s per verification question. Averaged per question: 15 * 0.4 = 6s.
 */
function getCvOverhead(hasCv: boolean): number {
  return hasCv ? 6 : 0;
}

/**
 * Maximum questions allowed per topic, capped by interview duration
 * to prevent single-topic domination.
 */
function getMaxQuestionsPerTopic(totalMinutes: number): number {
  if (totalMinutes <= 10) return 4;
  if (totalMinutes <= 20) return 6;
  if (totalMinutes <= 45) return 8;
  if (totalMinutes <= 60) return 10;
  return 14; // 90+ min
}

// ─── Core Functions ───

/**
 * Computes the full interview plan: time allocation per topic,
 * question budgets, and pacing configuration.
 */
export function computeInterviewPlan(
  totalMinutes: number,
  topics: TopicInput[],
  options?: TimingOptions
): InterviewPlan {
  const numTopics = topics.length;
  const hasCv = options?.hasCv ?? false;

  // Guard: minimum 1 topic, minimum 1 minute
  const safeTotalMinutes = Math.max(1, totalMinutes);
  const safeTopics = numTopics > 0 ? topics : [{ label: 'General', weight: 5 }];
  const safeNumTopics = safeTopics.length;

  // Overhead reservations
  const greetingOverheadSec = getGreetingOverhead(safeTotalMinutes);
  const closingOverheadSec = getClosingOverhead(safeTotalMinutes);
  const transitionOverheadSec = getTransitionOverhead(safeTotalMinutes, safeNumTopics);

  const totalSeconds = safeTotalMinutes * 60;
  const usableSeconds = Math.max(0, totalSeconds - greetingOverheadSec - closingOverheadSec - transitionOverheadSec);

  // Sum of weights for proportional distribution
  const sumWeights = safeTopics.reduce((sum, t) => sum + Math.max(1, t.weight), 0);

  // Base question cycle for this interview duration
  const baseCycle = getBaseQuestionCycle(safeTotalMinutes);
  const cvOverhead = getCvOverhead(hasCv);
  const maxPerTopic = getMaxQuestionsPerTopic(safeTotalMinutes);

  // Pace config
  const paceConfig = getInterviewPaceConfig(safeTotalMinutes);

  // Compute per-topic budgets
  const topicBudgets: TopicBudget[] = safeTopics.map((topic) => {
    const effectiveWeight = Math.max(1, topic.weight);
    const allocatedSeconds = usableSeconds * (effectiveWeight / sumWeights);

    // Question cycle adjusted for topic's question type
    const adjustedCycle = adjustCycleForQuestionType(baseCycle, topic.questionType) + cvOverhead;
    const questionCycleSec = Math.max(30, adjustedCycle); // floor at 30s

    // Question budget: how many full cycles fit in the allocated time
    const rawBudget = Math.floor(allocatedSeconds / questionCycleSec);
    const questionBudget = Math.max(1, Math.min(rawBudget, maxPerTopic));

    return {
      label: topic.label,
      weight: effectiveWeight,
      allocatedSeconds: Math.floor(allocatedSeconds),
      questionBudget,
      questionCycleSec: Math.round(questionCycleSec),
    };
  });

  const totalQuestions = topicBudgets.reduce((sum, t) => sum + t.questionBudget, 0);

  return {
    totalMinutes: safeTotalMinutes,
    greetingOverheadSec,
    closingOverheadSec,
    transitionOverheadSec,
    usableSeconds: Math.round(usableSeconds),
    topics: topicBudgets,
    totalQuestions,
    paceConfig,
  };
}

/**
 * Returns the question budget for a specific topic by index.
 * Safe: returns a default if the index is out of bounds.
 */
export function getQuestionBudget(topicIndex: number, plan: InterviewPlan): TopicBudget {
  if (topicIndex >= 0 && topicIndex < plan.topics.length) {
    return plan.topics[topicIndex];
  }
  // Fallback for out-of-bounds
  return {
    label: 'Unknown',
    weight: 5,
    allocatedSeconds: 0,
    questionBudget: 2,
    questionCycleSec: 70,
  };
}

/**
 * Returns the pacing configuration for a given interview duration.
 * Used to inject style hints into the LLM system prompt.
 */
export function getInterviewPaceConfig(totalMinutes: number): PaceConfig {
  if (totalMinutes <= 7) {
    return {
      label: 'VERY SHORT INTERVIEW: Be ultra-concise. Ask pointed, high-signal questions. Zero small talk. Each question must extract maximum insight in minimum time.',
      questionStyle: 'concise',
      maxTokensHint: 200,
      acknowledgmentLength: 'minimal',
    };
  }
  if (totalMinutes <= 15) {
    return {
      label: 'SHORT INTERVIEW: Be concise and direct. Minimal pleasantries. Focus on the most revealing questions for each topic.',
      questionStyle: 'concise',
      maxTokensHint: 250,
      acknowledgmentLength: 'minimal',
    };
  }
  if (totalMinutes <= 35) {
    return {
      label: 'STANDARD INTERVIEW: Balance depth with pace. Include brief acknowledgments and natural transitions.',
      questionStyle: 'standard',
      maxTokensHint: 350,
      acknowledgmentLength: 'brief',
    };
  }
  if (totalMinutes <= 55) {
    return {
      label: 'LONG INTERVIEW: You have time to explore deeply. Ask follow-up questions, dig into examples, and probe edge cases.',
      questionStyle: 'deep',
      maxTokensHint: 400,
      acknowledgmentLength: 'normal',
    };
  }
  return {
    label: 'VERY LONG INTERVIEW: Explore topics thoroughly. Use storytelling prompts, edge cases, and lessons learned. Take your time.',
    questionStyle: 'deep',
    maxTokensHint: 450,
    acknowledgmentLength: 'normal',
  };
}

/**
 * Computes real-time pacing adjustments based on elapsed time vs. planned progress.
 *
 * Call this on each turn to determine if the interview is ahead/behind schedule
 * and whether to add or skip questions for the current topic.
 */
export function computeRealTimePacing(
  elapsedSeconds: number,
  currentTopicIndex: number,
  questionsAskedOnCurrentTopic: number,
  plan: InterviewPlan
): RealTimePacing {
  const totalSeconds = plan.totalMinutes * 60;
  const percentElapsed = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;

  // Expected progress: what fraction of topics should be done by now
  const numTopics = plan.topics.length;
  const expectedTopicProgress = percentElapsed * numTopics;

  // Actual progress: current topic index + fraction of current topic questions done
  const currentBudget = plan.topics[currentTopicIndex]?.questionBudget ?? 2;
  const topicFraction = currentBudget > 0 ? questionsAskedOnCurrentTopic / currentBudget : 1;
  const actualProgress = currentTopicIndex + topicFraction;

  const progressDelta = actualProgress - expectedTopicProgress;

  // Remaining time analysis
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const topicsRemaining = numTopics - currentTopicIndex;
  const secondsPerRemainingTopic = topicsRemaining > 0 ? remainingSeconds / topicsRemaining : 0;

  // Determine urgency
  let urgency: RealTimePacing['urgency'] = 'normal';
  if (percentElapsed >= 0.90) {
    urgency = 'critical';
  } else if (progressDelta < -1.5) {
    urgency = 'hurry';
  } else if (progressDelta > 1.0) {
    urgency = 'relaxed';
  }

  // Suggest adjustments
  let suggestAddQuestions = 0;
  let suggestSkipQuestions = 0;
  let message = '';

  if (progressDelta > 1.0 && questionsAskedOnCurrentTopic < currentBudget) {
    // Ahead of schedule — candidate is answering fast
    suggestAddQuestions = Math.min(2, Math.floor(progressDelta));
    message = `Ahead of schedule by ~${Math.round(progressDelta * 10) / 10} topics. You can ask ${suggestAddQuestions} extra question(s) on this topic for deeper exploration.`;
  } else if (progressDelta < -1.0) {
    // Behind schedule — need to accelerate
    suggestSkipQuestions = Math.min(
      Math.max(0, currentBudget - questionsAskedOnCurrentTopic - 1), // keep at least 1 more
      Math.ceil(Math.abs(progressDelta))
    );
    message = `Behind schedule by ~${Math.round(Math.abs(progressDelta) * 10) / 10} topics. Consider shorter questions or skipping ${suggestSkipQuestions} question(s).`;
  } else if (urgency === 'critical') {
    const topicsLeft = numTopics - currentTopicIndex - 1;
    message = `CRITICAL: ${Math.round(remainingSeconds)}s remaining with ${topicsLeft} topic(s) left. Wrap up immediately.`;
    suggestSkipQuestions = Math.max(0, currentBudget - questionsAskedOnCurrentTopic - 1);
  } else {
    message = `On track. ~${Math.round(secondsPerRemainingTopic)}s available per remaining topic.`;
  }

  return {
    onTrack: Math.abs(progressDelta) <= 1.0 && urgency !== 'critical',
    suggestAddQuestions,
    suggestSkipQuestions,
    urgency,
    message,
  };
}

/**
 * Generates a human-readable "min-max" range string for the system prompt.
 * The range is budget ± 1, clamped to [1, budget + 2].
 */
export function getQuestionsRange(budget: TopicBudget): string {
  const min = Math.max(1, budget.questionBudget - 1);
  const max = budget.questionBudget + 1;
  return `${min}-${max}`;
}
