import { NextResponse, type NextRequest } from 'next/server';

import { CONTENT_GENERATION_MODEL } from '@/lib/ai-model';
import { requireOrgMembership } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { chatCompletion } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { generateRubricRequestSchema, type GenerateRubricRequest } from '@/lib/schemas/api';

/**
 * POST /api/generate-rubric — genera o enriquece la rúbrica de evaluación de una
 * vacante.
 *
 * QUÉ ESTABA MAL
 * --------------
 * Sin sesión, sin validación y sin tope de tasa, como el resto de los endpoints
 * de IA. Lo llamaban CUATRO sitios de `/admin/create-role`, todos ellos pantallas
 * autenticadas de empleador, así que exigir sesión no quita nada.
 *
 * Además `topics.map(...)` y `customTopics.map(...)` corrían sin comprobar que
 * fueran arrays, así que un cuerpo malformado devolvía `500` en vez de `400`.
 *
 * LA RÚBRICA NO ES UN DATO COSMÉTICO
 * ----------------------------------
 * Es el material con el que la IA califica al candidato (`/api/chat`,
 * `/api/evaluate`), y por eso `src/lib/jobs/public-projection.ts` existe: para
 * que NO salga en las lecturas públicas del portal. Dejar su generación abierta
 * era la otra cara del mismo problema: cualquiera podía consumir el modelo para
 * producirlas.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Número de criterios recomendado según la duración. */
function getRecommendedTopicCount(minutes: number): string {
  if (minutes <= 10) return '2-3';
  if (minutes <= 20) return '3-4';
  if (minutes <= 35) return '4-6';
  if (minutes <= 50) return '5-7';
  if (minutes <= 75) return '6-8';
  return '7-10';
}

/** Guía de profundidad según la duración. */
function getDepthGuidance(minutes: number): string {
  if (minutes <= 10)
    return 'Focus ONLY on the 2-3 most essential skills. Each topic should be highly specific and directly job-critical.';
  if (minutes <= 20)
    return 'Focus on core competencies. Keep topics targeted and avoid overlap.';
  if (minutes <= 35)
    return 'Balance breadth and depth. Include both technical and soft skills most relevant to the role.';
  if (minutes <= 50)
    return 'Cover a comprehensive range of skills. Include technical depth, soft skills, and role-specific scenarios.';
  if (minutes <= 75)
    return 'Provide thorough coverage. Include advanced technical topics, behavioral assessment, leadership indicators, and cultural fit.';
  return 'Maximum depth and breadth. Cover advanced technical mastery, complex problem-solving, leadership, cultural alignment, growth potential, and specialized domain knowledge.';
}

/** Bloque de modo de entrevista. */
function buildModeGuidance(mode: GenerateRubricRequest['interviewMode']): string {
  return mode === 'internal'
    ? `
INTERVIEW MODE: INTERNAL
Generate the rubric for an internal interview or internal mobility process.
Focus more on:
- Readiness for the new role
- Cross-functional collaboration
- Company/context familiarity
- Motivation for internal movement
- Growth potential
- Leadership and ownership signals
Avoid overly generic external screening topics.
Prefer fewer, sharper criteria when duration is short.
`
    : `
INTERVIEW MODE: RESTRICTED
Generate the rubric for a structured external/restricted interview.
Focus on:
- Objective role fit
- Technical or functional competence
- Behavioral evidence
- Communication clarity
- Risk signals and consistency
`;
}

/** Los tres modos de la ruta, resueltos por qué campos llegan. */
type RubricMode = 'single' | 'enrich' | 'generate';

function resolveMode(body: GenerateRubricRequest): RubricMode {
  if (body.singleCriterion?.name) return 'single';
  if (body.customTopics && body.customTopics.length > 0) return 'enrich';
  return 'generate';
}

/** Prompts de cada modo. */
function buildPrompts(
  body: GenerateRubricRequest,
  mode: RubricMode,
): { systemPrompt: string; userMessage: string } {
  const lang = body.language === 'es' ? 'Spanish (Español)' : 'English';
  const modeGuidance = buildModeGuidance(body.interviewMode);
  const durationMinutes = body.interviewDuration ?? 30;

  if (mode === 'single') {
    const criterion = body.singleCriterion!;
    const weight = criterion.weight ?? 5;

    return {
      systemPrompt: `You are an expert HR consultant. Generate evaluation criteria for ONE specific interview topic.

${modeGuidance}

Return a JSON object with:
- "label": "${criterion.name}" (keep as-is)
- "rubric": {
  - "excellent": 1 sentence describing what a top-performing candidate (9-10 score) demonstrates
  - "acceptable": 1 sentence describing what an adequate candidate (6-8 score) demonstrates
  - "poor": 1 sentence describing what a weak candidate (0-5 score) demonstrates
  - "weight": ${weight}
}

JOB CONTEXT:
- Title: ${body.jobTitle || 'Not specified'}
- Type: ${body.jobType || 'Not specified'}
- Description: ${body.description || 'Not provided'}

Return ONLY the JSON object. No markdown, no explanation.
CRITICAL: All text values MUST be in ${lang}.`,
      userMessage: `Generate evaluation rubric for this criterion: "${criterion.name}" (weight: ${weight}/10)`,
    };
  }

  if (mode === 'enrich') {
    const customTopics = body.customTopics!;

    return {
      systemPrompt: `You are an expert HR consultant. A recruiter has defined custom interview topics for the role "${body.jobTitle}". 
Your job is to ENRICH each topic with evaluation criteria and an importance weight.

${modeGuidance}

INTERVIEW DURATION: ${durationMinutes} minutes (${customTopics.length} topics means ~${Math.round((durationMinutes * 0.8) / customTopics.length)} min per topic)

For each topic provided, generate:
- "label": keep the original label as-is
- "rubric": an object with:
  - "excellent": 1 sentence describing what a top-performing candidate (9-10 score) demonstrates
  - "acceptable": 1 sentence describing what an adequate candidate (6-8 score) demonstrates
  - "poor": 1 sentence describing what a weak candidate (0-5 score) demonstrates
  - "weight": importance from 1-10 based on how critical this topic is for the specific role

JOB CONTEXT:
- Title: ${body.jobTitle}
- Type: ${body.jobType || 'Full Time'}
- Description: ${body.description || 'Not provided'}

Return ONLY a JSON array of objects. No markdown, no explanation.
CRITICAL: All text values MUST be in ${lang}.`,
      userMessage: `Enrich these interview topics with evaluation criteria:\n${customTopics
        .map(
          (topic, index) =>
            `${index + 1}. "${topic.label}"${topic.weight ? ` (suggested weight: ${topic.weight}/10)` : ''}`,
        )
        .join('\n')}`,
    };
  }

  const recommendedCount = getRecommendedTopicCount(durationMinutes);

  return {
    systemPrompt: `You are an expert HR consultant who works with companies across ALL industries — tech, healthcare, education, retail, manufacturing, finance, hospitality, media, and more.

Given a job posting and interview duration, generate interview topics that are HIGHLY SPECIFIC to this role and industry. Each topic must include evaluation criteria.

${modeGuidance}

INTERVIEW DURATION: ${durationMinutes} minutes
RECOMMENDED TOPIC COUNT: ${recommendedCount} topics
DEPTH GUIDANCE: ${getDepthGuidance(durationMinutes)}

For each topic, return an object with:
- "label": concise topic name (3-6 words)
- "rubric": an object with:
  - "excellent": 1 sentence — what a top candidate (9-10) demonstrates for this topic
  - "acceptable": 1 sentence — what an adequate candidate (6-8) demonstrates
  - "poor": 1 sentence — what a weak candidate (0-5) demonstrates
  - "weight": importance 1-10 for THIS specific role

RULES:
- Generate EXACTLY ${recommendedCount} topics (adjust to fit the ${durationMinutes}-minute interview duration)
- Mix technical/hard skills AND soft skills appropriate to the role
- Topics must be DIRECTLY relevant to the job description, not generic
- Weights should vary — not all 5s. The most critical skill for the role should be 8-10, nice-to-haves 2-4
- For short interviews (≤15 min): only include absolutely essential, high-weight topics
- For long interviews (≥60 min): include deeper, more nuanced topics that allow thorough assessment
- If no description is provided, infer from the job title and type

Return ONLY a JSON array of objects. No markdown formatting, no explanation.
CRITICAL: All text values MUST be in ${lang}.`,
    userMessage: `Generate interview rubric topics for this role:

TITLE: "${body.jobTitle}"
TYPE: ${body.jobType || 'Not specified'}
DURATION: ${durationMinutes} minutes
DESCRIPTION: ${body.description || 'Not provided — infer from the title'}`,
  };
}

/**
 * Extrae el array de criterios de la respuesta del modelo.
 *
 * Con `response_format: json_object` el proveedor garantiza un OBJETO, no un
 * array, y cada modelo envuelve el array bajo una clave distinta. Se prueban las
 * habituales antes de rendirse; la última red es la primera propiedad cuyo valor
 * sea un array.
 */
function extractTopicsArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;

  for (const key of ['topics', 'criteria', 'items', 'rubric', 'data']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }

  const firstArray = Object.values(record).find((value) => Array.isArray(value));

  return Array.isArray(firstArray) ? firstArray : null;
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrgMembership();

    await enforceRateLimit(req, RATE_LIMITS.AI_GENERATE, orgId);

    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = generateRubricRequestSchema.parse(rawBody);
    const mode = resolveMode(body);
    const { systemPrompt, userMessage } = buildPrompts(body, mode);

    const completion = await chatCompletion({
      model: CONTENT_GENERATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5,
      jsonMode: true,
      timeoutMs: 45_000,
      title: 'Reclutify AI Interviewer',
      signal: req.signal,
    });

    const parsed = completion.parseJson<unknown>();

    if (!parsed) {
      throw ApiError.upstream('The AI service returned an unreadable rubric');
    }

    if (mode === 'single') {
      return NextResponse.json({ criterion: parsed });
    }

    const topics = extractTopicsArray(parsed);

    if (!topics || topics.length === 0) {
      throw ApiError.upstream('The AI service returned no usable criteria');
    }

    return NextResponse.json({ topics });
  } catch (error) {
    return handleApiError(error, '[generate-rubric]');
  }
}
