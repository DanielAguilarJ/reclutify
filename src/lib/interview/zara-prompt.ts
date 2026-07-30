import type { InterviewPlan, RealTimePacing, PaceConfig } from '@/lib/interviewTimingEngine';
import type {
  ChatRequest,
  CvDataInput,
  InterviewMessageInput,
  InterviewTopicInput,
} from '@/lib/schemas/interview';

/**
 * Construcción del prompt de Zara.
 *
 * POR QUÉ ESTÁ FUERA DE LA RUTA
 * -----------------------------
 * `/api/chat/route.ts` tenía 939 líneas y el 80 % era esto: interpolación de
 * texto. Mezclado en el mismo `try` estaban la autorización, el conteo de
 * preguntas, la telemetría, dos llamadas a OpenRouter y el manejo de errores, así
 * que no se podía leer una sin las otras ni probar ninguna por separado.
 *
 * Aquí las funciones son PURAS: reciben datos y devuelven cadenas. Eso permite
 * comprobar en un test que el presupuesto de preguntas aparece en el prompt, o
 * que la fase de cierre no incluye una pregunta nueva, sin levantar la ruta ni
 * simular OpenRouter.
 *
 * EL TEXTO NO SE HA TOCADO
 * ------------------------
 * Todas las cadenas son literalmente las de la versión anterior. El prompt de una
 * entrevistadora es comportamiento de producto calibrado: los `Bug N fix` que
 * aparecen en los comentarios son correcciones reales del pasado y reescribir el
 * texto «para que quede mejor» las tiraría. Lo único que cambia es DÓNDE vive.
 */

// ─── Rúbricas ────────────────────────────────────────────────────────────────

/** Rúbrica de un criterio, con los valores por defecto ya aplicados. */
export interface NormalizedRubric {
  weight: number;
  excellent: string;
  acceptable: string;
  poor: string;
}

/**
 * Completa la rúbrica de un criterio.
 *
 * Un criterio sin rúbrica sigue siendo evaluable con descriptores genéricos; la
 * alternativa —dejarlo fuera— haría que el tema se tratara sin criterio de
 * puntuación.
 */
export function ensureRubric(topic: Pick<InterviewTopicInput, 'label' | 'rubric'>): NormalizedRubric {
  const rubric = topic.rubric;

  return {
    weight: rubric?.weight ?? 5,
    excellent:
      rubric?.excellent?.trim() ||
      `Dominio sobresaliente en ${topic.label}; demuestra experiencia avanzada con ejemplos concretos`,
    acceptable:
      rubric?.acceptable?.trim() ||
      `Conocimiento funcional en ${topic.label}; puede aplicarlo con supervisión mínima`,
    poor:
      rubric?.poor?.trim() ||
      `Carencias notables en ${topic.label}; no logra demostrar competencia básica`,
  };
}

// ─── Conteo de preguntas y fase de la entrevista ─────────────────────────────

/** Estado del turno derivado del historial. */
export interface TurnState {
  /** Preguntas que Zara ya hizo sobre el tema actual. */
  questionsInCurrentTopic: number;
  /** Índice desde el que empieza el tema actual, acotado al historial. */
  safeTopicStart: number;
  isFirstMessage: boolean;
  isOpeningPhase: boolean;
  isTransitionToNewTopic: boolean;
}

/**
 * Deriva el estado del turno del historial recibido.
 *
 * El conteo se apoya en `topicStartIndex`, que el cliente conoce porque él mismo
 * avanzó de tema, en lugar de buscar frases de transición en lenguaje natural. El
 * comentario original lo razona: escanear frases era frágil.
 *
 * El saludo de apertura CONTIENE una pregunta real —se le pide al modelo que
 * termine con una—, así que cuenta como la primera del tema 0. Si no contara, el
 * tema 0 tendría presupuesto+1 preguntas y el resto solo presupuesto.
 */
export function deriveTurnState(input: {
  recentMessages: InterviewMessageInput[];
  topicStartIndex: number;
  currentTopicIndex: number;
  clientOpeningPhase: boolean;
}): TurnState {
  const { recentMessages, currentTopicIndex, clientOpeningPhase } = input;

  const safeTopicStart = Math.max(0, Math.min(input.topicStartIndex, recentMessages.length));

  const questionsInCurrentTopic = recentMessages
    .slice(safeTopicStart)
    .filter(
      (message) =>
        message.role === 'assistant' &&
        !message.content.includes('[NEXT_TOPIC]') &&
        !message.content.includes('[END_INTERVIEW]'),
    ).length;

  const isFirstMessage = recentMessages.filter((message) => message.role === 'user').length === 0;
  const isOpeningPhase = clientOpeningPhase || isFirstMessage;

  return {
    questionsInCurrentTopic,
    safeTopicStart,
    isFirstMessage,
    isOpeningPhase,
    isTransitionToNewTopic:
      !isOpeningPhase && questionsInCurrentTopic === 0 && currentTopicIndex > 0,
  };
}

/**
 * Aísla las preguntas ya formuladas, para la regla de no repetición.
 *
 * No se truncan a 100 caracteres —eso mataba la cola distintiva de cada
 * pregunta— y se excluyen los mensajes que no preguntan nada (saludos,
 * transiciones puras).
 */
export function extractQuestion(content: string): string | null {
  const clean = content.replace(/\[NEXT_TOPIC\]|\[END_INTERVIEW\]/g, '').trim();
  const questionSentences = clean.match(/[^.!?¡¿\n]*\?+/g);

  if (!questionSentences || questionSentences.length === 0) return null;

  const joined = questionSentences.map((sentence) => sentence.trim()).join(' ').trim();

  return joined.length >= 8 ? joined : null;
}

/** Lista de preguntas previas, formateada para el prompt. */
export function buildPreviousQuestions(recentMessages: InterviewMessageInput[]): string {
  const questions = recentMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => extractQuestion(message.content))
    .filter((question): question is string => question !== null)
    .map((question, index) => `  Q${index + 1}: "${question}"`)
    .join('\n');

  return questions || '  (none yet)';
}

/**
 * Fragmentos memorables de lo que dijo el candidato.
 *
 * Permite a Zara referenciar respuestas anteriores y sonar coherente a lo largo
 * de la sesión. Se acotan a respuestas de longitud media: las muy cortas no
 * aportan y las muy largas gastan contexto.
 */
export function buildCandidateMemory(recentMessages: InterviewMessageInput[]): string {
  const snippets = recentMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter((text) => text.length >= 60 && text.length <= 320)
    .slice(-4)
    .slice(0, 3);

  if (snippets.length === 0) return '';

  const rendered = snippets
    .map(
      (snippet, index) =>
        `${index + 1}. "${snippet.length > 200 ? `${snippet.substring(0, 200)}…` : snippet}"`,
    )
    .join('\n');

  return `\n━━━ CANDIDATE MEMORY (use sparingly to reference earlier answers) ━━━\n${rendered}`;
}

// ─── Bloques del prompt ──────────────────────────────────────────────────────

/** Lista de temas con estado y pistas de profundidad según el peso. */
export function buildTopicList(topics: InterviewTopicInput[], currentTopic: string): string {
  if (topics.length === 0) return `  - ${currentTopic}`;

  return topics
    .map((topic, index) => {
      const icon = topic.status === 'completed' ? '✅' : topic.status === 'current' ? '👉' : '⏳';
      const rubric = ensureRubric(topic);

      const depthHint =
        rubric.weight >= 8
          ? ' [DEEP DIVE — prioritize this topic]'
          : rubric.weight <= 3
            ? ' [QUICK — 1-2 questions max]'
            : '';

      const criteriaHint =
        topic.status === 'current'
          ? `\n      → Evaluate if candidate can: "${rubric.excellent}"`
          : '';

      return `  ${index + 1}. ${icon} ${topic.label} (Weight: ${rubric.weight}/10)${depthHint} [${topic.status ?? 'pending'}]${criteriaHint}`;
    })
    .join('\n');
}

/** Bloque completo de rúbrica. */
export function buildRubricBlock(topics: InterviewTopicInput[]): string {
  return topics
    .map((topic) => {
      const rubric = ensureRubric(topic);
      const criticality =
        rubric.weight >= 8 ? 'CRITICAL' : rubric.weight >= 5 ? 'IMPORTANT' : 'BASIC';

      return `  CRITERION: ${topic.label} (Weight: ${rubric.weight}/10 — ${criticality})
  ✅ EXCELLENT: ${rubric.excellent}
  ⚡ ACCEPTABLE: ${rubric.acceptable}
  ❌ DEFICIENT: ${rubric.poor}`;
    })
    .join('\n\n');
}

/** ¿El CV trae contenido utilizable? */
export function hasUsableCv(cvData: CvDataInput | null | undefined): boolean {
  if (!cvData) return false;

  return Boolean(cvData.name || cvData.experience.length > 0 || cvData.skills.length > 0);
}

/** Perfil del candidato extraído del CV, más las instrucciones de verificación. */
export function buildCvSections(
  cvData: CvDataInput | null | undefined,
  candidateName: string,
): { profile: string; verification: string } {
  if (!hasUsableCv(cvData) || !cvData) return { profile: '', verification: '' };

  const experience =
    cvData.experience
      .map(
        (entry) =>
          `- ${entry.title || 'Role'} at ${entry.company || 'Company'} (${entry.startDate || '?'} - ${entry.endDate || '?'}, ${entry.duration || 'unknown duration'})
  Responsibilities: ${entry.responsibilities.join(', ') || 'Not listed'}
  Achievements: ${entry.achievements.join(', ') || 'Not listed'}`,
      )
      .join('\n') || 'No experience listed';

  const education =
    cvData.education
      .map(
        (entry) =>
          `- ${entry.degree || 'Degree'} in ${entry.field || 'Field'} at ${entry.institution || 'Institution'} (${entry.year || 'Year unknown'})`,
      )
      .join('\n') || 'No education listed';

  const profile = `

=== CANDIDATE PROFILE (extracted from their CV) ===
Name: ${cvData.name || candidateName || 'Unknown'}
Current/Last Title: ${cvData.currentTitle || 'Not specified'}
Years of Experience: ${cvData.totalYearsExperience || 'Not specified'}
Professional Summary: ${cvData.summary || 'Not provided'}

Work Experience:
${experience}

Education:
${education}

Skills: ${cvData.skills.join(', ') || 'Not listed'}
Languages: ${cvData.languages.join(', ') || 'Not listed'}
Certifications: ${cvData.certifications.join(', ') || 'None listed'}
Red Flags Detected: ${cvData.redFlags.length > 0 ? cvData.redFlags.join('; ') : 'None detected'}
=== END CANDIDATE PROFILE ===`;

  const verification = `

CV VERIFICATION INSTRUCTIONS:
You have access to the candidate's CV profile above. You MUST incorporate BOTH types of questions:

TYPE 1 — VACANCY QUESTIONS (60% of your questions):
Technical and situational questions related to the job topics listed above.

TYPE 2 — CV VERIFICATION QUESTIONS (40% of your questions):
Based on the candidate's CV, generate questions to VERIFY and DEEPEN understanding:

a) EXPERIENCE VERIFICATION:
- Reference specific companies/roles from their CV: "I see you worked at [company] as [title] for [duration]. What was your biggest achievement there?"
- Ask about specific responsibilities: "How did you handle [specific responsibility from CV]? Give me a concrete example."
- Probe employment gaps if any were detected in redFlags.

b) SKILLS VERIFICATION:
- "You list [skill] on your CV. Walk me through a real project where you applied it."
- "What's your current proficiency in [skill]? Which projects best demonstrate it?"

c) COHERENCE CHECKS:
- If there are career gaps (check redFlags): ask what they did during that time
- If they progressed very quickly: ask how they achieved that progression
- If they changed jobs frequently: ask about their reasons

d) SOFT SKILLS FROM HISTORY:
- "How did you handle conflicts in your team at [company X]?"
- "What did you learn from your time at [company Y] that you apply today?"

PROPORTION: Alternate naturally between vacancy questions and CV verification. Don't cluster all CV questions together.

CONSISTENCY TRACKING: Mentally track if the candidate's verbal answers are consistent with their CV claims. If you detect inconsistencies, probe deeper with follow-up questions. At the end of the interview, your final message before [END_INTERVIEW] should include an internal note: "[CV_CONSISTENCY: Alta/Media/Baja]" to flag the consistency level.`;

  return { profile, verification };
}

/** Métricas de tiempo ya calculadas, listas para el prompt. */
export interface TimeMetrics {
  elapsedMinutes: string;
  remainingMinutes: string;
  percentComplete: number;
  topicsRemaining: number;
  minutesPerRemainingTopic: number;
  minutesPerTopic: number;
  totalMinutes: number;
  totalTopics: number;
}

/**
 * Bloque de estado temporal.
 *
 * En periodo de gracia se anclan las cifras mostradas: antes el modelo veía
 * «100 %+ transcurrido / 0 min restantes» y eso le empujaba a saltarse preguntas
 * o cerrar antes de tiempo.
 */
export function buildTimeStatusBlock(input: {
  metrics: TimeMetrics;
  currentTopic: string;
  currentTopicIndex: number;
  questionsInCurrentTopic: number;
  maxQuestionsHardLimit: number;
  baseHardLimit: number;
  pacing: RealTimePacing;
  isGracePeriod: boolean;
  isClosingPhase: boolean;
}): string {
  const { metrics, isGracePeriod } = input;

  const displayedPercent = isGracePeriod
    ? Math.min(85, metrics.percentComplete)
    : metrics.percentComplete;
  const displayedRemaining = isGracePeriod ? '∞ (grace)' : metrics.remainingMinutes;
  const displayedPerTopic = isGracePeriod ? '∞ (grace)' : String(metrics.minutesPerRemainingTopic);

  return `
━━━ TIME STATUS (REAL-TIME — USE THIS TO PACE YOURSELF) ━━━
⏱ Elapsed: ${metrics.elapsedMinutes} min of ${metrics.totalMinutes} min planned (${displayedPercent}% of plan)
⏳ Remaining: ${displayedRemaining} min
📍 Current Topic: ${input.currentTopicIndex + 1} of ${metrics.totalTopics} ("${input.currentTopic}")
📊 Topics remaining after this: ${metrics.topicsRemaining - 1}
⏰ Available time per remaining topic: ~${displayedPerTopic} min
🔢 Questions asked on this topic: ${input.questionsInCurrentTopic} of ${input.maxQuestionsHardLimit} max (base budget: ${input.baseHardLimit}, urgency: ${input.pacing.urgency})
📈 PACING: ${input.pacing.message}
${isGracePeriod ? '\n🟢 GRACE PERIOD: The interview has exceeded its planned duration but uncovered topics remain. Continue at a natural, unhurried pace — finish the remaining topics with proper questions. Do NOT close the interview yet. Do NOT rush or skip.' : ''}
${input.isClosingPhase && !isGracePeriod ? '\n🔴 CLOSING PHASE ACTIVE — You are at 90%+ of the interview time AND on the last topic. You MUST wrap up now.' : ''}`;
}

/** Fase del turno, que decide qué se le permite hacer a Zara. */
export type InterviewPhaseKind =
  | 'opening'
  | 'closing'
  | 'final-topic-exhausted'
  | 'topic-exhausted'
  | 'closing-stay'
  | 'transition'
  | 'exploration';

/** Determina la fase del turno. El orden de las ramas es el de la versión original. */
export function resolvePhase(input: {
  isOpeningPhase: boolean;
  isClosingPhase: boolean;
  isLastTopic: boolean;
  mustAdvanceNow: boolean;
  isTransitionToNewTopic: boolean;
}): InterviewPhaseKind {
  if (input.isOpeningPhase) return 'opening';
  if (input.isClosingPhase && input.isLastTopic) return 'closing';
  if (input.mustAdvanceNow) {
    return input.isLastTopic ? 'final-topic-exhausted' : 'topic-exhausted';
  }
  if (input.isClosingPhase) return 'closing-stay';
  if (input.isTransitionToNewTopic) return 'transition';
  return 'exploration';
}

/** Instrucciones de la fase. */
export function buildPhaseInstruction(input: {
  phase: InterviewPhaseKind;
  candidateName: string;
  roleTitle: string;
  currentTopic: string;
  nextTopicLabel: string;
  totalMinutes: number;
  totalTopics: number;
  questionsInCurrentTopic: number;
  maxQuestionsHardLimit: number;
  hasRubricGuidance: boolean;
}): string {
  switch (input.phase) {
    case 'opening':
      return `
PHASE: OPENING (MANDATORY)
This is the START of the interview. You MUST deliver a professional opening:
1. Greet the candidate warmly by name ("${input.candidateName}")
2. Introduce yourself as Zara, their interviewer for the position of ${input.roleTitle}
3. Briefly explain the interview format: "This interview will last approximately ${input.totalMinutes} minutes and we'll discuss ${input.totalTopics} key areas."
4. Make the candidate feel comfortable with a brief encouraging phrase
5. Then ask your FIRST question about the first topic: "${input.currentTopic}"

Keep the opening concise but warm (3-4 sentences max before your first question).
Do NOT list all the topics — just mention you'll cover several areas.

Bug 5 fix — FOCUSED FIRST QUESTION:
- Exactly ONE question, ONE clause. No "and", "y", "or" joining multiple sub-questions.
- Do NOT enumerate multiple concepts in one sentence (e.g. AVOID "Scratch, Python AND electronics for kids 8 AND 14").
- Pick the SINGLE most revealing angle to start. Save the rest for follow-ups.
- Length: under 25 words.
- This is the opening — keep it inviting, not overwhelming.`;

    case 'closing':
      return `
PHASE: CLOSING (MANDATORY)
You have reached the closing phase. Your response MUST:
1. Briefly acknowledge the candidate's last answer (max 8 words)
2. Thank the candidate sincerely for their time and participation
3. Mention that the evaluation team will review the interview and they will be contacted about next steps
4. Wish them well with a warm, encouraging closing
5. Append [END_INTERVIEW] at the end
DO NOT ask any more questions. This is the final message.`;

    case 'final-topic-exhausted':
      return `
PHASE: FINAL TOPIC EXHAUSTED → CLOSE
The question budget for the final topic "${input.currentTopic}" is full (${input.questionsInCurrentTopic}/${input.maxQuestionsHardLimit}).
You MUST now:
1. Acknowledge the candidate's last answer in ONE short sentence (max 12 words).
2. Deliver a warm professional goodbye, mentioning the evaluation team will follow up.
3. Append [END_INTERVIEW] at the very end.
DO NOT ask any new question. This is the final message.`;

    case 'topic-exhausted':
      return `
PHASE: TOPIC EXHAUSTED → TRANSITION ONLY
The question budget for "${input.currentTopic}" is full (${input.questionsInCurrentTopic}/${input.maxQuestionsHardLimit}).
You MUST now emit a clean transition — NO new question on this topic.
Structure:
1. ONE short sentence acknowledging the candidate's last answer (max 12 words).
2. ONE brief transition sentence announcing the next topic by NAME.
3. Append [NEXT_TOPIC] at the very end.
Example: "Excelente perspectiva. Pasemos ahora a hablar de ${input.nextTopicLabel}. [NEXT_TOPIC]"
DO NOT ask any question. The first question of the new topic happens in the next turn.`;

    case 'closing-stay':
      return `
PHASE: CLOSING — STAY THE COURSE
Continue at the planned pace. Ask one focused question on the current topic. Do NOT prematurely transition or close — the timing system will tell you when to wrap up via mustAdvanceNow or the CLOSING phase on the final topic.`;

    case 'transition':
      return `
PHASE: TOPIC TRANSITION (first question of "${input.currentTopic}")
Brief acknowledgment of the previous topic (max 8 words), then ask your FIRST question about "${input.currentTopic}".
ONE focused question only — do NOT chain multiple sub-questions with "and"/"y".`;

    case 'exploration':
      return `
PHASE: EXPLORATION
Continue exploring topic "${input.currentTopic}" with probing follow-ups.
This is question ${input.questionsInCurrentTopic + 1} of ${input.maxQuestionsHardLimit} on this topic.
${input.hasRubricGuidance ? 'Vary the angle from the previous question (see EVALUATION GUIDE above).' : ''}`;
  }
}

/** Directiva del turno que se envía como último mensaje de usuario. */
export function buildTurnDirective(input: {
  phase: InterviewPhaseKind;
  currentTopic: string;
  questionsInCurrentTopic: number;
  maxQuestionsHardLimit: number;
}): string {
  switch (input.phase) {
    case 'opening':
      return 'Deliver the opening greeting and your FIRST question per the OPENING phase instructions above. One focused question only — no multi-part chains.';
    case 'final-topic-exhausted':
      return 'The final topic budget is exhausted. Deliver the closing message per RULE 9 and append [END_INTERVIEW]. NO new question.';
    case 'topic-exhausted':
      return `The current topic budget is exhausted. Emit ONLY the acknowledge + transition + [NEXT_TOPIC] per the PHASE instruction. NO new question on "${input.currentTopic}".`;
    case 'closing':
      return 'TIME IS UP. Deliver the closing message and append [END_INTERVIEW].';
    case 'closing-stay':
      return `Continue at the planned pace on "${input.currentTopic}". The system will tell you when to transition or close — do not pre-empt it.`;
    case 'transition':
      return `Start the new topic "${input.currentTopic}" with a brief acknowledgment of the previous topic, then ONE focused first question. Do NOT repeat any prior question.`;
    case 'exploration':
      return `Ask question #${input.questionsInCurrentTopic + 1} on "${input.currentTopic}" (max ${input.maxQuestionsHardLimit} for this topic). One focused question, different angle from prior questions (see RULE 10). Build on the candidate's last answer.`;
  }
}

/** Bloque de modo de entrevista. */
export function buildInterviewModeBlock(mode: ChatRequest['interviewMode']): string {
  return mode === 'internal'
    ? `
INTERVIEW MODE: INTERNAL
This is an internal interview or internal mobility conversation.
Adapt your behavior:
- Keep the process lighter, faster and more conversational.
- Do not mention screen sharing, fullscreen, proctoring or hardware verification.
- Assume the candidate may already know the company context.
- Prioritize role readiness, motivation, collaboration, growth potential and concrete examples.
- Still evaluate rigorously using the rubric.
- Mention that the session is being recorded only if naturally relevant, not repeatedly.
`
    : `
INTERVIEW MODE: RESTRICTED
This is a structured external/restricted interview.
Adapt your behavior:
- Keep the interview formal, structured and assessment-oriented.
- Do not apologize for security checks.
- Focus on objective evaluation, consistency and role fit.
`;
}

/**
 * Guía de evaluación interna del tema actual.
 *
 * Deliberadamente NO cita el criterio «excellent» como plantilla de pregunta: el
 * comentario original explica que hacerlo provocaba que el modelo reformulara la
 * misma frase de la rúbrica en cada pregunta.
 */
export function buildRubricGuidance(currentRubric: NormalizedRubric | null): string {
  if (!currentRubric) return '';

  return `\nEVALUATION GUIDE (internal — DO NOT quote in your questions):
   • You are silently judging the candidate against this topic's rubric.
   • Each question on this topic MUST probe a DIFFERENT angle (e.g. real past example, hypothetical scenario, specific technique, trade-off, failure case, edge case).
   • NEVER ask two questions that share the same verb or framing on the same topic.
   • Score the answer internally as excellent / acceptable / poor based on the rubric you already received in EVALUATION RUBRIC above. Do not narrate this judgment in your response.`;
}

/** Pista de estilo de pregunta según el ritmo calculado. */
export function buildQuestionStyleHint(questionStyle: PaceConfig['questionStyle']): string {
  if (questionStyle === 'concise') {
    return '\nQUESTION STYLE: Ask SHORT, DIRECT questions. No STAR prompts. Example: "¿Cuál es tu experiencia en X?" instead of "Cuéntame sobre una situación en la que tuviste que...". Keep acknowledgments to 2-3 words max.';
  }

  if (questionStyle === 'deep') {
    return '\nQUESTION STYLE: You have time for ELABORATE questions. Use STAR prompts, ask for specific examples, probe edge cases, and explore lessons learned. Acknowledgments can be 1-2 sentences.';
  }

  return '';
}

/** Todo lo que el prompt de sistema necesita. */
export interface ZaraPromptInput {
  request: ChatRequest;
  plan: InterviewPlan;
  pacing: RealTimePacing;
  turn: TurnState;
  metrics: TimeMetrics;
  phase: InterviewPhaseKind;
  maxQuestionsHardLimit: number;
  baseHardLimit: number;
  mustAdvanceNow: boolean;
}

/**
 * Ensambla el prompt de sistema completo.
 *
 * Es la única función que conoce el orden de los bloques; las de arriba solo
 * saben construir el suyo.
 */
export function buildZaraSystemPrompt(input: ZaraPromptInput): string {
  const { request, plan, pacing, turn, metrics, phase } = input;
  const { paceConfig } = plan;

  const language = request.language === 'es' ? 'Spanish (Español)' : 'English';

  const currentTopicData = request.allTopics.find((topic) => topic.label === request.currentTopic);
  const currentRubric = currentTopicData ? ensureRubric(currentTopicData) : null;
  const rubricGuidance = buildRubricGuidance(currentRubric);

  const cv = buildCvSections(request.cvData, request.candidateName);

  const phaseInstruction = buildPhaseInstruction({
    phase,
    candidateName: request.candidateName,
    roleTitle: request.roleTitle,
    currentTopic: request.currentTopic,
    nextTopicLabel:
      request.allTopics[request.currentTopicIndex + 1]?.label || 'el siguiente tema',
    totalMinutes: metrics.totalMinutes,
    totalTopics: metrics.totalTopics,
    questionsInCurrentTopic: turn.questionsInCurrentTopic,
    maxQuestionsHardLimit: input.maxQuestionsHardLimit,
    hasRubricGuidance: rubricGuidance.length > 0,
  });

  const timeStatusBlock = buildTimeStatusBlock({
    metrics,
    currentTopic: request.currentTopic,
    currentTopicIndex: request.currentTopicIndex,
    questionsInCurrentTopic: turn.questionsInCurrentTopic,
    maxQuestionsHardLimit: input.maxQuestionsHardLimit,
    baseHardLimit: input.baseHardLimit,
    pacing,
    isGracePeriod: request.isGracePeriod,
    isClosingPhase: request.isClosingPhase,
  });

  return `You are Zara, a Senior HR Recruiter at a top-tier corporation conducting a professional structured interview.
You are an EXPERT interviewer trained in behavioral interviewing techniques (STAR method), technical assessment, and candidate evaluation.

YOUR IDENTITY: Professional, warm but focused, efficient. You make candidates feel respected while extracting maximum signal from every answer.

${buildInterviewModeBlock(request.interviewMode)}

JOB INFO:
- Title: ${request.roleTitle}
- Description: ${request.roleDescription}
${cv.profile}

INTERVIEW STRUCTURE (${metrics.totalTopics} topics in ${metrics.totalMinutes} minutes):
${buildTopicList(request.allTopics, request.currentTopic)}

EVALUATION RUBRIC:
${buildRubricBlock(request.allTopics) || '  No specific rubric — evaluate general competence.'}

CURRENT TOPIC: ${request.currentTopic}${rubricGuidance}
${cv.verification}
${buildCandidateMemory(request.recentMessages)}

${timeStatusBlock}

${phaseInstruction}

━━━ INTERVIEWER METHODOLOGY ━━━

You follow a professional interview methodology:

1. ACKNOWLEDGE → PROBE → EVALUATE
   - First: Brief acknowledgment of the candidate's answer (2-8 words max, never empty)
   - Then: One focused question that digs deeper based on what they said
   - Internally: Evaluate if their answer reveals EXCELLENT, ACCEPTABLE, or POOR competence

2. QUESTION TYPES (vary these):
   - BEHAVIORAL: "Tell me about a time when..." / "Describe a situation where..."
   - TECHNICAL: "How would you implement..." / "Explain how..."
   - SITUATIONAL: "What would you do if..." / "Imagine that..."
   - PROBING: "Can you elaborate on..." / "What specifically did you do when..."

3. DEPTH CALIBRATION:
   - If the candidate gives a STRONG answer → ask a harder follow-up to find their ceiling
   - If the candidate gives a WEAK answer → ask a simpler version or move on (don't torture them)
   - If the candidate gives a VAGUE answer → ask for a specific example or concrete detail

━━━ STRICT RULES (FOLLOW EXACTLY) ━━━

RULE 1 — ONE QUESTION ONLY: Each response contains exactly ONE question. Never list multiple questions or sub-questions.
   • A "question" is one interrogative clause ending in "?". No commas with "and"/"or"/"y"/"o" stacking multiple things to answer.
   • If you find yourself writing two "?" marks, delete the second.

RULE 2 — CONTEXT CONTINUITY: Your question MUST logically follow the candidate's last answer.
Brief acknowledgment (2-8 words), then your new question.

RULE 3 — QUESTION COUNTER (HARD LIMIT — NO EXCEPTIONS):
You have asked ${turn.questionsInCurrentTopic} questions on the CURRENT topic "${request.currentTopic}".
Hard limit for this topic this turn: ${input.maxQuestionsHardLimit} questions.
${
  input.mustAdvanceNow
    ? `⛔ LIMIT REACHED: Emit ONLY the transition (or closing) per the PHASE instruction above.
     ABSOLUTELY DO NOT include a new question for "${request.currentTopic}" in this response.`
    : `✅ You may ask ${input.maxQuestionsHardLimit - turn.questionsInCurrentTopic} more question(s) on this topic.
     When the hard limit is reached on a future turn, the system will tell you to transition — DO NOT pre-emptively transition while you still have budget.`
}

RULE 4 — NEVER REPEAT QUESTIONS:
Below is the FULL TEXT of every question you have ALREADY asked in this interview. Do NOT ask any of them again — not a rephrased version, not a synonym, not the "same thing from a different angle".
${buildPreviousQuestions(request.recentMessages)}

RULE 5 — DEAD END DETECTION:
If the candidate gives 2+ consecutive empty, dismissive, or off-topic answers ("no sé", "tampoco sé", "I don't know", or responses under 5 words),
you MUST immediately output ONLY: ${request.isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} — no additional text.

RULE 5b — CONFUSED CANDIDATE:
If the candidate's last message is a single confused word (e.g. "Cómo", "What", "Qué", "huh?") OR a fragment under 6 words that does not answer your last question, you MUST briefly rephrase your previous question more simply BEFORE asking anything new. Do NOT count this turn against the topic budget.

RULE 6 — PACE: ${paceConfig.label}${buildQuestionStyleHint(paceConfig.questionStyle)}
Total: ${metrics.totalMinutes} min, ${metrics.totalTopics} topics, ~${metrics.minutesPerTopic.toFixed(1)} min/topic. Adapt to the candidate's actual response pace.

RULE 7 — LANGUAGE: Respond ONLY in ${language}. No exceptions.

RULE 8 — TRANSITIONS: [NEXT_TOPIC] is emitted ONLY when the system signals mustAdvanceNow=true (see RULE 3). A transition message is acknowledgment + one transition sentence + [NEXT_TOPIC] — NEVER mixed with a new question.

RULE 9 — PROFESSIONAL CLOSING: When you include [END_INTERVIEW], end with a warm, professional goodbye. Thank the candidate for their time and mention that the team will be in touch.

RULE 10 — VARIETY OF QUESTION ANGLES:
Within the same topic, every question MUST attack a DIFFERENT angle. Rotate through:
   • A concrete past example (STAR)
   • A hypothetical / situational ("what would you do if…")
   • A specific technique or method ("how exactly do you implement X")
   • A trade-off / decision ("when would you choose A over B")
   • A failure case ("describe a time it went wrong")
Never re-use the same opener ("¿Cómo manejarías…?", "¿Cómo mantienes…?") twice on the same topic.`;
}

/**
 * Construye el array de mensajes que se envía al modelo.
 *
 * La directiva del turno va como un mensaje de usuario SEPARADO y claramente
 * marcado, en vez de concatenada a la respuesta del propio candidato. Cuando eso
 * dejaría dos mensajes de usuario consecutivos se intercala un `assistant`
 * neutro, porque hay proveedores que exigen alternancia estricta de roles.
 */
export function buildModelMessages(input: {
  systemPrompt: string;
  recentMessages: InterviewMessageInput[];
  turnDirective: string;
  isOpeningPhase: boolean;
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: input.systemPrompt },
  ];

  const conversation = input.recentMessages.map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content,
  }));

  if (input.isOpeningPhase && conversation.length === 0) {
    messages.push({ role: 'user', content: `[SYSTEM TURN-DIRECTIVE]\n${input.turnDirective}` });
    return messages;
  }

  if (conversation.length === 0) return messages;

  messages.push(...conversation);

  if (messages[messages.length - 1]?.role === 'user') {
    messages.push({ role: 'assistant', content: '(processing)' });
  }

  messages.push({
    role: 'user',
    content: `[SYSTEM TURN-DIRECTIVE — this is not from the candidate; act on it now and reply to the candidate]\n${input.turnDirective}`,
  });

  return messages;
}

/**
 * Limpia los prefijos y ecos de instrucciones que el modelo a veces antepone.
 *
 * Se conserva tal cual: son tres patrones observados en producción, no defensa
 * hipotética.
 */
export function stripModelArtifacts(message: string): string {
  return message
    .replace(/^(ZARA\s*(\(Entrevistadora\))?\s*:\s*)/i, '')
    .trim()
    .replace(/^\[INSTRUCTION[^\]]*\].*?\n/i, '')
    .trim()
    .replace(/^\[SYSTEM INSTRUCTION[^\]]*\].*?\n/i, '')
    .trim();
}
