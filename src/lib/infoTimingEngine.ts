// ============================================================
// INFO TIMING ENGINE
// Manages time allocation and pacing for information sessions.
// ============================================================

export interface TopicAllocation {
  topicIndex: number;
  allocatedSeconds: number;
}

export type UrgencyLevel = 'relaxed' | 'normal' | 'hurry' | 'wrap_up';

/**
 * Calculates time allocation for each topic in the session.
 * Distributes time evenly with slight front-loading for intro/greeting
 * and back-loading for closing/objection handling.
 */
export function getTopicAllocation(
  sessionDurationMinutes: number,
  topicsCount: number
): TopicAllocation[] {
  if (topicsCount <= 0) return [];

  const totalSeconds = sessionDurationMinutes * 60;

  // Reserve 10% for greeting and 15% for closing/wrap-up
  const greetingReserve = Math.floor(totalSeconds * 0.1);
  const closingReserve = Math.floor(totalSeconds * 0.15);
  const availableForTopics = totalSeconds - greetingReserve - closingReserve;

  // Distribute remaining time evenly across topics
  const baseAllocation = Math.floor(availableForTopics / topicsCount);
  const remainder = availableForTopics - baseAllocation * topicsCount;

  const allocations: TopicAllocation[] = [];
  for (let i = 0; i < topicsCount; i++) {
    // Give extra seconds to earlier topics (they tend to have more intro context)
    const extra = i < remainder ? 1 : 0;
    allocations.push({
      topicIndex: i,
      allocatedSeconds: baseAllocation + extra,
    });
  }

  return allocations;
}

/**
 * Determines the current urgency level based on elapsed time.
 * This helps the AI adjust its pacing and decide when to start closing.
 *
 * Thresholds:
 * - relaxed: 0% - 50% of total time
 * - normal: 50% - 70% of total time
 * - hurry: 70% - 85% of total time
 * - wrap_up: 85%+ of total time
 */
export function getCurrentUrgency(
  elapsedSeconds: number,
  totalSeconds: number
): UrgencyLevel {
  if (totalSeconds <= 0) return 'wrap_up';

  const progress = elapsedSeconds / totalSeconds;

  if (progress < 0.5) return 'relaxed';
  if (progress < 0.7) return 'normal';
  if (progress < 0.85) return 'hurry';
  return 'wrap_up';
}

/**
 * Determines if the conversation should move to the next topic
 * based on time elapsed within the current topic's allocation.
 *
 * Returns true if the topic has exceeded 90% of its allocated time.
 */
export function shouldMoveToNextTopic(
  elapsedSeconds: number,
  currentTopicAllocation: number
): boolean {
  if (currentTopicAllocation <= 0) return true;

  const topicProgress = elapsedSeconds / currentTopicAllocation;
  return topicProgress >= 0.9;
}

/**
 * Helper: Get the overall session progress as a percentage (0-100).
 */
export function getSessionProgress(
  elapsedSeconds: number,
  totalSeconds: number
): number {
  if (totalSeconds <= 0) return 100;
  return Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));
}

/**
 * Helper: Get formatted remaining time string.
 */
export function getRemainingTimeFormatted(
  elapsedSeconds: number,
  totalSeconds: number
): string {
  const remaining = Math.max(0, totalSeconds - elapsedSeconds);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
