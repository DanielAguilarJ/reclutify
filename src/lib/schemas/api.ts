import { z } from 'zod';

/**
 * Esquemas de entrada de las rutas que NO pertenecen al flujo de entrevista:
 * correo transaccional, entrega de webhooks, prueba de integraciones y
 * generación de contenido con IA para el panel.
 *
 * Todas comparten un motivo para existir: antes aceptaban el cuerpo tal cual y
 * lo pasaban a un proveedor externo (Brevo, Resend, la URL del webhook,
 * OpenRouter) sin comprobar ni forma ni tamaño.
 */

// ─── POST /api/send-email ────────────────────────────────────────────────────

/**
 * Correo del candidato.
 *
 * Zod valida el formato, pero el control que importa no es este: es que la ruta
 * ahora exige sesión de la organización y comprueba que el destinatario sea un
 * candidato o invitado de ESA organización. Sin eso, un formato de correo válido
 * seguía siendo un relé abierto.
 */
const emailSchema = z.string().trim().toLowerCase().email().max(320);

/**
 * Cuerpo del correo de invitación a entrevista.
 *
 * `link` es el campo peligroso: se inserta en `href` dentro del HTML del correo
 * que sale firmado desde `hola@reclutify.com`. Se valida como URL absoluta y la
 * ruta comprueba además que apunte al dominio propio de la aplicación; un enlace
 * arbitrario convertía el endpoint en phishing con la reputación del remitente
 * de la empresa.
 */
export const sendEmailRequestSchema = z.object({
  email: emailSchema,
  candidateName: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().max(300).catch(''),
  link: z.string().trim().url().max(2_000),
  language: z.enum(['en', 'es']).catch('es'),
});

export type SendEmailRequest = z.infer<typeof sendEmailRequestSchema>;

// ─── POST /api/webhooks/candidate-completed ──────────────────────────────────

/**
 * Entrega de un webhook de «entrevista completada».
 *
 * **`webhookUrl` y `webhookSecret` ya NO se aceptan del cuerpo.** Antes la ruta
 * hacía `fetch(webhookUrl)` con la URL que llegara, sin sesión: era un SSRF
 * completo y además un oráculo, porque devolvía el código de estado del destino.
 *
 * Ahora el destino y el secreto se leen de `webhook_configs` para la
 * organización que la credencial acredita. El cliente ya no elige a dónde se
 * conecta el servidor; solo dispara la entrega de la configuración que el
 * empleador guardó en su panel.
 */
export const webhookDispatchRequestSchema = z.object({
  ticketToken: z.string().trim().min(1).max(128).nullish(),
  publicToken: z.string().trim().min(1).max(128).nullish(),

  /**
   * Vacante de la entrevista. Opcional a propósito: el botón «probar webhook» de
   * `/admin/settings` no tiene ninguna entrevista y solo aporta su sesión. Ver
   * `requireInterviewOrOrgAccess`.
   */
  roleId: z.string().trim().min(1).max(200).nullish().catch(null),

  candidateId: z.string().trim().max(200).nullish().catch(null),
  candidateName: z.string().trim().max(300).catch(''),
  overallScore: z.number().min(0).max(100).nullish().catch(null),
  recommendation: z.string().trim().max(100).catch(''),
  /** Puntuación por criterio. Claves y valores acotados. */
  topicScores: z.record(z.string().max(500), z.number()).nullish().catch(null),
  completedAt: z.string().trim().max(100).nullish().catch(null),
  isTest: z.boolean().catch(false),
});

export type WebhookDispatchRequest = z.infer<typeof webhookDispatchRequestSchema>;

// ─── POST /api/test-integration ──────────────────────────────────────────────

/**
 * Prueba de una integración desde el panel del asesor.
 *
 * Cada variante declara solo lo que su probador usa. El discriminante es `type`,
 * así que un `type` desconocido se rechaza con `400` en la validación en vez de
 * caer en el `default` del `switch` y devolver un mensaje que confirma qué tipos
 * existen.
 *
 * Los secretos (`credentials`, `api_key`, `token`) llegan en el cuerpo porque el
 * asesor los está introduciendo en ese momento para probarlos; nunca se
 * devuelven en la respuesta ni se registran.
 */
export const testIntegrationRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('webhook'),
    config: z.object({
      url: z.string().trim().url().max(2_000),
      secret: z.string().max(500).catch(''),
      events: z.array(z.string().max(100)).max(50).catch([]),
    }),
  }),
  z.object({
    type: z.literal('google_sheets'),
    config: z.object({
      spreadsheet_id: z.string().trim().min(1).max(200),
      // Es un JSON de cuenta de servicio; el tope es holgado porque incluye una
      // clave privada PEM.
      credentials: z.string().min(1).max(20_000),
      sheet_name: z.string().trim().max(200).catch(''),
    }),
  }),
  z.object({
    type: z.literal('hubspot'),
    config: z.object({
      api_key: z.string().trim().min(1).max(500),
      pipeline_id: z.string().trim().max(200).catch(''),
    }),
  }),
  z.object({
    type: z.literal('notion'),
    config: z.object({
      token: z.string().trim().min(1).max(500),
      database_id: z.string().trim().min(1).max(200),
    }),
  }),
]);

export type TestIntegrationRequest = z.infer<typeof testIntegrationRequestSchema>;

// ─── POST /api/generate-rubric ───────────────────────────────────────────────

/** Criterio suelto que el reclutador pide enriquecer. */
const customTopicSchema = z.looseObject({
  label: z.string().trim().min(1).max(500),
  weight: z.number().min(0).max(10).nullish().catch(null),
});

/**
 * Cuerpo de la generación de rúbricas.
 *
 * La ruta tiene tres modos y los distingue por qué campos llegan
 * (`singleCriterion` → uno; `customTopics` → enriquecer; ninguno → generar desde
 * cero). Se conserva esa forma en vez de convertirla en una unión discriminada
 * para no obligar a cambiar las cuatro llamadas del panel en el mismo commit que
 * añade la validación.
 */
export const generateRubricRequestSchema = z.object({
  jobTitle: z.string().trim().max(500).catch(''),
  description: z.string().trim().max(20_000).catch(''),
  jobType: z.string().trim().max(200).catch(''),
  language: z.enum(['en', 'es']).catch('en'),
  interviewDuration: z.number().int().min(1).max(480).nullish().catch(null),
  interviewMode: z.enum(['restricted', 'internal']).catch('restricted'),
  customTopics: z.array(customTopicSchema).max(40).nullish().catch(null),
  singleCriterion: z
    .looseObject({
      name: z.string().trim().min(1).max(500),
      weight: z.number().min(0).max(10).nullish().catch(null),
    })
    .nullish()
    .catch(null),
});

export type GenerateRubricRequest = z.infer<typeof generateRubricRequestSchema>;

// ─── POST /api/generate-course-topics ────────────────────────────────────────

export const generateCourseTopicsRequestSchema = z.object({
  name: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).catch(''),
  targetAudience: z.string().trim().max(2_000).catch(''),
  objectives: z.array(z.string().max(1_000)).max(50).catch([]),
  benefits: z.array(z.string().max(1_000)).max(50).catch([]),
  modules: z
    .array(
      z.looseObject({
        title: z.string().max(500).catch(''),
        description: z.string().max(4_000).catch(''),
        orderIndex: z.number().nullish().catch(null),
      }),
    )
    .max(100)
    .catch([]),
  plans: z
    .array(
      z.looseObject({
        name: z.string().max(300).catch(''),
        price: z.number().nullish().catch(null),
        currency: z.string().max(10).catch('MXN'),
        features: z.array(z.string().max(500)).max(50).catch([]),
      }),
    )
    .max(20)
    .catch([]),
});

export type GenerateCourseTopicsRequest = z.infer<typeof generateCourseTopicsRequestSchema>;

// ─── POST /api/group-interview ───────────────────────────────────────────────

export const groupInterviewRequestSchema = z.object({
  roleId: z.string().trim().min(1).max(200),
  language: z.enum(['en', 'es']).catch('es'),
  questionCount: z.number().int().min(1).max(50).catch(10),
});

export type GroupInterviewRequest = z.infer<typeof groupInterviewRequestSchema>;

// ─── POST /api/public-interview ──────────────────────────────────────────────

/**
 * Alta de candidato por enlace público.
 *
 * Sin sesión por definición: es el flujo del enlace general de la vacante. El
 * control es el tope de tasa por IP (`RATE_LIMITS.PUBLIC_REGISTER`) más estos
 * topes de longitud; antes la ruta aceptaba nombres y correos de cualquier
 * tamaño y creaba una fila en `candidate_results` por petición, así que un bucle
 * llenaba el pipeline de la organización.
 */
export const publicInterviewRegisterSchema = z.object({
  token: z.string().trim().min(1).max(128),
  candidateName: z.string().trim().min(1).max(200),
  candidateEmail: emailSchema,
  candidatePhone: z.string().trim().max(50).catch(''),
  linkedinUrl: z.string().trim().max(500).catch(''),
});

export type PublicInterviewRegisterRequest = z.infer<typeof publicInterviewRegisterSchema>;

/** Cadena de consulta de la validación del enlace público. */
export const publicInterviewTokenQuerySchema = z.object({
  token: z.string().trim().min(1).max(128),
});


// ─── POST /api/info-chat ─────────────────────────────────────────────────────

/**
 * Sesión informativa con el asesor virtual.
 *
 * POR QUÉ NO EXIGE SESIÓN (y sí tope de tasa)
 * -------------------------------------------
 * Es el mismo caso que `/api/tts`: la usa `/informes/[courseId]`, una página PÚBLICA
 * para posibles clientes que no tienen cuenta. Exigir sesión dejaría el asesor
 * virtual sin funcionar, que es el producto entero de ese módulo.
 *
 * Y como en TTS, no hay recurso que proteger: la ruta lee la configuración del curso
 * por su `courseId` y devuelve un turno de conversación. El riesgo es el COSTE —cada
 * turno es una llamada a un modelo con `max_tokens: 500` y razonamiento activado, de
 * las más caras del proyecto— y el control correcto para el coste es el tope de tasa
 * más estos topes de longitud.
 *
 * Los topes importan especialmente aquí porque TODO este cuerpo se interpola en el
 * prompt de sistema: el nombre del curso, sus objetivos, sus beneficios, sus módulos,
 * sus planes con precios, los testimonios, los ganchos de urgencia y las respuestas a
 * objeciones. Sin acotar, quien llama controla un prompt de tamaño arbitrario.
 */
export const infoChatRequestSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  courseName: z.string().trim().max(500).catch(''),
  courseDescription: z.string().max(20_000).catch(''),
  courseObjectives: z.array(z.string().max(1_000)).max(50).catch([]),
  courseBenefits: z.array(z.string().max(1_000)).max(50).catch([]),
  courseModules: z.array(z.looseObject({}).catch({})).max(100).catch([]),
  coursePlans: z.array(z.looseObject({}).catch({})).max(20).catch([]),
  courseTopics: z.array(z.looseObject({}).catch({})).max(40).catch([]),
  objectionResponses: z.record(z.string().max(200), z.string().max(4_000)).catch({}),
  testimonials: z.array(z.string().max(2_000)).max(50).catch([]),
  urgencyHooks: z.array(z.string().max(1_000)).max(50).catch([]),
  targetAudience: z.string().max(2_000).catch(''),
  durationInfo: z.string().max(500).catch(''),
  modality: z.string().max(100).catch(''),

  clientName: z.string().trim().max(200).catch(''),
  clientAge: z.number().int().min(0).max(150).nullish().catch(null),
  clientOccupation: z.string().max(300).catch(''),
  courseFor: z.string().max(300).catch(''),

  recentMessages: z
    .array(z.looseObject({ role: z.string().max(50), content: z.string().max(8_000) }))
    .max(200)
    .catch([]),
  language: z.enum(['en', 'es']).catch('es'),
  sessionDuration: z.number().int().min(1).max(480).nullish().catch(null),
});

export type InfoChatRequestInput = z.infer<typeof infoChatRequestSchema>;

// ─── POST /api/info-notify ───────────────────────────────────────────────────

export const infoNotifyRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  clientName: z.string().trim().max(200).catch(''),
  courseName: z.string().trim().max(500).catch(''),
  /**
   * Tipo de aviso. Es un enum cerrado y no una cadena libre: la ruta lo escribe en
   * `coach_notifications.type` y lo usa para elegir el asunto del correo, así que un
   * valor arbitrario acabaría en la base y en la bandeja del asesor.
   */
  type: z.enum(['closing_ready', 'new_lead']),
});
