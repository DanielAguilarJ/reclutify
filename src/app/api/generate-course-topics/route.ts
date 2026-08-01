import { NextResponse, type NextRequest } from 'next/server';

import { CONTENT_GENERATION_MODEL } from '@/lib/ai-model';
import { requireOrgMembership } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { chatCompletion } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { generateCourseTopicsRequestSchema } from '@/lib/schemas/api';

/**
 * POST /api/generate-course-topics — genera las fases de la conversación de venta
 * del asesor virtual.
 *
 * QUÉ ESTABA MAL
 * --------------
 * Sin sesión, sin tope de tasa y con validación parcial (solo comprobaba que
 * `name` fuera una cadena). El único llamante es `/coach/create-course`, una
 * pantalla autenticada, así que exigir sesión no quita funcionalidad.
 *
 * También llamaba a OpenRouter sin tope de tiempo: una llamada colgada consumía
 * el tiempo de ejecución completo de la función serverless.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Fase de la conversación tal como la devuelve el modelo. */
interface RawTopic {
  id?: unknown;
  label?: unknown;
  talkingPoints?: unknown;
  order?: unknown;
  duration?: unknown;
}

/**
 * Normaliza una fase.
 *
 * Se conserva la tolerancia de la versión anterior —campos ausentes se rellenan
 * con valores por defecto en vez de descartar la fase— porque el asesor virtual
 * funciona igual con una etiqueta genérica y sin ella se queda sin guion.
 */
function normalizeTopic(raw: RawTopic, index: number) {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    label: typeof raw.label === 'string' && raw.label ? raw.label : `Tema ${index + 1}`,
    talkingPoints: Array.isArray(raw.talkingPoints)
      ? raw.talkingPoints.filter((point): point is string => typeof point === 'string')
      : [],
    order: typeof raw.order === 'number' ? raw.order : index + 1,
    duration: typeof raw.duration === 'number' ? raw.duration : 3,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrgMembership();

    await enforceRateLimit(req, RATE_LIMITS.AI_GENERATE, orgId);

    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = generateCourseTopicsRequestSchema.parse(rawBody);

    const modulesList =
      body.modules
        .map(
          (module, index) =>
            `  ${index + 1}. ${module.title}${module.description ? `: ${module.description}` : ''}`,
        )
        .join('\n') || '  (no modules defined yet)';

    const plansList =
      body.plans
        .map(
          (plan) =>
            `  - ${plan.name}: $${plan.price ?? 0} ${plan.currency}${plan.features.length ? ` (${plan.features.join(', ')})` : ''}`,
        )
        .join('\n') || '  (no plans defined yet)';

    const objectivesList = body.objectives.map((item) => `  - ${item}`).join('\n') || '  (none)';
    const benefitsList = body.benefits.map((item) => `  - ${item}`).join('\n') || '  (none)';

    const systemPrompt = `You are an expert sales conversation designer for coaching programs and online courses.
Your job is to generate a structured set of conversational TOPICS (phases) for a virtual sales session where an AI "Coach Virtual" will inform and sell a course to a potential client.

Each topic represents a PHASE of the sales conversation, with specific talking points the AI should cover.

RULES:
1. Generate exactly 5-6 topics covering the full sales conversation arc
2. Each topic must have 3-6 specific talking points
3. Topics must flow naturally in a sales conversation sequence
4. Talking points should be actionable phrases/sentences the AI can use or adapt
5. Include emotional triggers, benefit-focused language, and urgency elements
6. The "duration" field is an estimated number of minutes for that phase
7. Return ONLY valid JSON, no markdown or extra text

REQUIRED TOPIC STRUCTURE (adapt labels to be specific to this course):
1. Opening & Discovery - greet, learn about the client's needs/pain points
2. Program Presentation - introduce what the course is and its philosophy
3. Modules & Content - detailed breakdown of what they'll learn
4. Results & Benefits - outcomes, transformations, testimonials
5. Investment & Plans - pricing, plan options, value proposition
6. Closing & Call to Action - urgency, next steps, commitment

OUTPUT FORMAT:
{
  "topics": [
    {
      "id": "<uuid>",
      "label": "<topic name in Spanish>",
      "talkingPoints": ["<point 1>", "<point 2>", ...],
      "order": <number starting at 1>,
      "duration": <estimated minutes>
    }
  ]
}`;

    const completion = await chatCompletion({
      model: CONTENT_GENERATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate conversational topics for the following course/program:

COURSE NAME: ${body.name}
DESCRIPTION: ${body.description || 'Not provided'}
TARGET AUDIENCE: ${body.targetAudience || 'General'}

OBJECTIVES:
${objectivesList}

BENEFITS:
${benefitsList}

MODULES:
${modulesList}

PLANS/PRICING:
${plansList}

Generate 5-6 sales conversation topics with specific talking points in Spanish. Make them persuasive and focused on converting the client.`,
        },
      ],
      temperature: 0.7,
      maxTokens: 2000,
      jsonMode: true,
      timeoutMs: 45_000,
      title: 'Reclutify Coach Platform',
      signal: req.signal,
    });

    const parsed = completion.parseJson<{ topics?: unknown }>();
    const rawTopics = parsed?.topics;

    if (!Array.isArray(rawTopics) || rawTopics.length === 0) {
      throw ApiError.upstream('The AI service returned no usable topics');
    }

    return NextResponse.json({
      topics: rawTopics.map((topic, index) => normalizeTopic((topic ?? {}) as RawTopic, index)),
    });
  } catch (error) {
    return handleApiError(error, '[generate-course-topics]');
  }
}
