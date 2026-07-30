import { z } from 'zod';

import { MAX_ACCESS_PROOF_TOKEN_LENGTH } from '@/lib/candidate-results/access-proof-contracts';

/**
 * Esquemas de entrada de las rutas de IA de la entrevista.
 *
 * POR QUÉ CADA CAMPO LLEVA UN TOPE
 * --------------------------------
 * Estas rutas no solo escriben en la base: construyen el prompt que se envía a
 * OpenRouter, que factura por token. Sin topes, el cuerpo de la petición ES el
 * presupuesto de la cuenta:
 *
 *  - `recentMessages` se vuelca íntegro en el array de mensajes del modelo. Un
 *    array de 100 000 entradas es una factura, no una entrevista.
 *  - `roleDescription`, `roleTitle`, `candidateName` y todo `cvData` se
 *    interpolan DENTRO del prompt de sistema. Sin tope, quien llama controla el
 *    prompt entero: puede sustituir las instrucciones de Zara por las suyas
 *    (inyección de prompt) y, de paso, pagar el contexto con el saldo ajeno.
 *
 * Acotar no elimina la inyección de prompt —eso exigiría separar datos e
 * instrucciones, que la API de chat no permite— pero sí acota su tamaño, y
 * combinado con exigir credencial de entrevista deja de ser explotable por
 * cualquiera.
 *
 * POR QUÉ NO SE USA `strictObject`
 * --------------------------------
 * Los clientes actuales envían campos que la ruta ignora, y un `strictObject`
 * los rechazaría con `400`, rompiendo la entrevista en producción durante el
 * despliegue. Se usa `looseObject`: los campos declarados se validan, los demás
 * se descartan al construir el objeto de salida. La ruta solo ve lo declarado.
 *
 * QUÉ SE MANTIENE DE LA FORMA ANTERIOR
 * ------------------------------------
 * Todos los valores por defecto reproducen los que las rutas ya aplicaban con
 * `= 0` / `= false` / `= 'restricted'` en la desestructuración. Un cliente que
 * hoy funciona sigue funcionando: lo único que cambia es que un cuerpo
 * MALFORMADO ahora recibe `400` en vez de reventar con un `500` a mitad del
 * manejador (`POST {}` hacía `recentMessages.length` sobre `undefined`).
 */

// ─── Piezas compartidas ──────────────────────────────────────────────────────

/** Credenciales de acceso del candidato sin cuenta. Ver `access-proof-contracts`. */
const accessProofFields = {
  ticketToken: z.string().trim().min(1).max(MAX_ACCESS_PROOF_TOKEN_LENGTH).nullish(),
  publicToken: z.string().trim().min(1).max(MAX_ACCESS_PROOF_TOKEN_LENGTH).nullish(),
};

/** Idioma de la conversación. Cualquier otro valor cae a inglés en las rutas. */
export const interviewLanguageSchema = z.enum(['en', 'es']).catch('en');

/** Modo de entrevista. */
export const interviewModeSchema = z.enum(['restricted', 'internal']).catch('restricted');

/** Tope de mensajes del historial que se aceptan en un turno. */
export const MAX_RECENT_MESSAGES = 200;

/** Tope de caracteres por mensaje del historial. */
export const MAX_MESSAGE_LENGTH = 8_000;

/** Tope de criterios de evaluación de una vacante. */
export const MAX_TOPICS = 40;

/**
 * Rúbrica de un criterio.
 *
 * Los descriptores se acotan porque van al prompt tres veces (lista de temas,
 * bloque de rúbrica y guía del tema actual).
 */
const topicRubricSchema = z.looseObject({
  weight: z.number().min(0).max(10).catch(5),
  excellent: z.string().max(2_000).catch(''),
  acceptable: z.string().max(2_000).catch(''),
  poor: z.string().max(2_000).catch(''),
});

/**
 * Criterio de evaluación tal como lo envía el cliente.
 *
 * `status` lo usa la ruta para pintar el icono de progreso en el prompt.
 * `.catch()` en la rúbrica degrada un criterio con rúbrica corrupta a «sin
 * rúbrica» en vez de rechazar la petición entera: la entrevista puede seguir con
 * la rúbrica por defecto que ya calcula `ensureRubric`.
 */
export const interviewTopicSchema = z.looseObject({
  id: z.string().max(200).optional(),
  label: z.string().min(1).max(500),
  status: z.string().max(50).optional(),
  score: z.number().optional(),
  rubric: topicRubricSchema.optional().catch(undefined),
});

export type InterviewTopicInput = z.infer<typeof interviewTopicSchema>;

/** Un turno del historial de la conversación. */
export const interviewMessageSchema = z.looseObject({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

export type InterviewMessageInput = z.infer<typeof interviewMessageSchema>;

/**
 * CV extraído por `/api/parse-resume`.
 *
 * Cada array lleva tope de elementos y cada texto de longitud porque el bloque
 * entero se interpola en el prompt de sistema. `looseObject` en las entradas de
 * experiencia y formación porque el modelo que las extrae puede añadir campos.
 */
export const cvDataSchema = z.looseObject({
  name: z.string().max(300).catch(''),
  email: z.string().max(300).catch(''),
  phone: z.string().max(100).catch(''),
  summary: z.string().max(4_000).catch(''),
  currentTitle: z.string().max(300).catch(''),
  totalYearsExperience: z.union([z.number(), z.string().max(50)]).catch(0),
  experience: z
    .array(
      z.looseObject({
        company: z.string().max(300).catch(''),
        title: z.string().max(300).catch(''),
        startDate: z.string().max(100).catch(''),
        endDate: z.string().max(100).catch(''),
        duration: z.string().max(100).catch(''),
        responsibilities: z.array(z.string().max(1_000)).max(30).catch([]),
        achievements: z.array(z.string().max(1_000)).max(30).catch([]),
      }),
    )
    .max(30)
    .catch([]),
  education: z
    .array(
      z.looseObject({
        institution: z.string().max(300).catch(''),
        degree: z.string().max(300).catch(''),
        field: z.string().max(300).catch(''),
        year: z.string().max(50).catch(''),
      }),
    )
    .max(20)
    .catch([]),
  skills: z.array(z.string().max(200)).max(100).catch([]),
  languages: z.array(z.string().max(200)).max(30).catch([]),
  certifications: z.array(z.string().max(300)).max(50).catch([]),
  redFlags: z.array(z.string().max(1_000)).max(30).catch([]),
});

export type CvDataInput = z.infer<typeof cvDataSchema>;

// ─── POST /api/chat ──────────────────────────────────────────────────────────

/**
 * Cuerpo de un turno de entrevista.
 *
 * `roleId` es OBLIGATORIO y es nuevo: es lo que permite comprobar que la
 * credencial presentada acredita ESTA vacante. Sin él, un token válido de
 * cualquier entrevista serviría para consumir cuota de IA con el prompt de
 * cualquier otra.
 */
export const chatRequestSchema = z.looseObject({
  ...accessProofFields,

  roleId: z.string().trim().min(1).max(200),

  currentTopic: z.string().max(500).catch(''),
  allTopics: z.array(interviewTopicSchema).max(MAX_TOPICS).catch([]),
  recentMessages: z.array(interviewMessageSchema).max(MAX_RECENT_MESSAGES).default([]),

  language: interviewLanguageSchema.default('en'),
  roleTitle: z.string().max(500).catch(''),
  roleDescription: z.string().max(20_000).catch(''),

  isLastTopic: z.boolean().catch(false),
  // 5 minutos como mínimo y 8 horas como máximo. El tope evita que un
  // `interviewDuration` absurdo haga que el motor de tiempos reparta un
  // presupuesto de preguntas desmedido.
  interviewDuration: z.number().int().min(1).max(480).catch(30),

  cvData: cvDataSchema.nullish().catch(null),
  candidateName: z.string().max(300).catch(''),

  timerSeconds: z.number().min(0).max(86_400).catch(0),
  currentTopicIndex: z.number().int().min(0).max(MAX_TOPICS).catch(0),
  topicStartIndex: z.number().int().min(0).max(MAX_RECENT_MESSAGES).catch(0),

  isClosingPhase: z.boolean().catch(false),
  isGracePeriod: z.boolean().catch(false),
  isOpeningPhase: z.boolean().catch(false),

  sessionId: z.string().max(200).nullish().catch(null),
  interviewMode: interviewModeSchema.default('restricted'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ─── POST /api/evaluate ──────────────────────────────────────────────────────

/** Una entrada de la transcripción a evaluar. */
const transcriptEntrySchema = z.looseObject({
  role: z.string().max(50).optional(),
  content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  timestamp: z.number().optional(),
});

/**
 * Cuerpo de la evaluación final.
 *
 * `transcript` admite más entradas que `recentMessages` porque aquí llega la
 * conversación COMPLETA, no una ventana. El tope sigue existiendo: una
 * entrevista de dos horas no pasa de unos cientos de turnos.
 */
export const evaluateRequestSchema = z.looseObject({
  ...accessProofFields,

  roleId: z.string().trim().min(1).max(200),

  transcript: z.array(transcriptEntrySchema).max(500).default([]),
  topics: z.array(interviewTopicSchema).max(MAX_TOPICS).default([]),
  candidateName: z.string().max(300).catch(''),
  language: interviewLanguageSchema.default('en'),
  roleTitle: z.string().max(500).catch(''),
  roleDescription: z.string().max(20_000).catch(''),
});

export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

// ─── POST /api/tts ───────────────────────────────────────────────────────────

/**
 * Tope de caracteres por síntesis.
 *
 * El texto más largo que la aplicación sintetiza es un mensaje de Zara, acotado
 * a su vez por `max_tokens` (300 en `/api/chat`, ~1 200 caracteres). 4 000 deja
 * margen de sobra para los mensajes de apertura y cierre, y corta el uso del
 * endpoint como sintetizador de audiolibros a nuestra costa.
 */
export const MAX_TTS_TEXT_LENGTH = 4_000;

export const ttsRequestSchema = z.looseObject({
  text: z.string().trim().min(1).max(MAX_TTS_TEXT_LENGTH),
  language: interviewLanguageSchema.default('en'),
});

export type TtsRequest = z.infer<typeof ttsRequestSchema>;

// ─── POST /api/upload-video ──────────────────────────────────────────────────

/**
 * Extensiones de vídeo admitidas.
 *
 * Lista blanca en lugar de lista negra: el cliente graba con `MediaRecorder`, que
 * produce `webm` o `mp4` según el navegador, y no hay ningún otro formato
 * legítimo. Una lista negra dejaría pasar `.html` o `.svg`, que servidos desde el
 * dominio público del bucket serían XSS almacenado.
 */
export const ALLOWED_VIDEO_EXTENSIONS = ['webm', 'mp4'] as const;

/** Tipos MIME admitidos, en el mismo orden de razonamiento. */
export const ALLOWED_VIDEO_CONTENT_TYPES = [
  'video/webm',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
] as const;

/**
 * Cuerpo de la petición de URL prefirmada.
 *
 * **`filename` ya NO se acepta.** Antes la ruta hacía `const key = filename` y
 * firmaba una escritura en esa clave exacta, sin sesión: cualquiera podía
 * sobrescribir cualquier objeto del bucket, incluidas las grabaciones de otros
 * candidatos, y subir contenido arbitrario con el tipo MIME que quisiera.
 *
 * Ahora el cliente declara únicamente a QUÉ entrevista pertenece el vídeo y con
 * qué extensión, y el servidor deriva la ruta completa. Ver
 * `buildInterviewVideoKey` en la ruta.
 */
export const uploadVideoRequestSchema = z.looseObject({
  ...accessProofFields,

  roleId: z.string().trim().min(1).max(200),
  /** Identificador de la fila de `candidate_results` a la que pertenece el vídeo. */
  resultId: z.string().trim().min(1).max(200),
  extension: z.enum(ALLOWED_VIDEO_EXTENSIONS).default('webm'),
  contentType: z.enum(ALLOWED_VIDEO_CONTENT_TYPES).default('video/webm'),
});

export type UploadVideoRequest = z.infer<typeof uploadVideoRequestSchema>;
