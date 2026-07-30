import { z } from 'zod';

/**
 * Contrato de las tres rutas de servidor de la sesión de informes:
 * creación, escritura parcial y lectura del estado.
 *
 * POR QUÉ EXISTEN ESAS RUTAS
 * --------------------------
 * Hasta ahora `/informes/[courseId]` escribía `info_sessions` desde el navegador
 * con la CLAVE ANON: `infoSessionStore.createSession` insertaba la fila,
 * `syncTranscript` actualizaba `transcript` y `objections_detected`, y
 * `updateSessionStatus` actualizaba `status`, `closing_mode`, `client_email` y
 * `client_phone`. Para que eso funcionara, `info_sessions` tiene tres políticas
 * abiertas en producción (`anon_insert_sessions` con `WITH CHECK (true)`,
 * `anon_read_own_session` y `anon_update_own_session` con `USING (true)`), que
 * además no estaban declaradas en `supabase/migrations/`.
 *
 * `USING (true)` no acota por sesión: acota por ROL. Y la clave anon viaja al
 * navegador de cualquier visitante, así que esas políticas son públicas:
 * cualquiera podía listar TODAS las sesiones de informes de todas las
 * organizaciones —con el nombre, el correo, el teléfono y la transcripción
 * completa de cada cliente— y reescribir la sesión de otra persona.
 *
 * Con la escritura en el servidor, la clave anon deja de necesitar acceso a la
 * tabla y esas tres políticas se pueden retirar.
 *
 * POR QUÉ HACE FALTA UNA CREDENCIAL Y NO BASTA EL `sessionId`
 * -----------------------------------------------------------
 * El identificador de la sesión es un UUID que viaja a todas partes: al store
 * del navegador, al cuerpo de `/api/info-chat`, al de `/api/info-notify` y al
 * canal de tiempo real. Es un NOMBRE, no una credencial: se puede filtrar en un
 * log o en una captura sin que eso deba conceder nada. Si el `sessionId` bastara
 * para escribir, la ruta de servidor tendría exactamente el mismo agujero que la
 * política abierta que sustituye, solo con un salto más.
 *
 * Por eso la ruta de creación emite un `accessToken` aleatorio, lo devuelve UNA
 * vez y guarda en la base solo su hash. Toda escritura posterior exige el par
 * `{ sessionId, accessToken }`, y la fila se localiza por los dos a la vez.
 *
 * ESTE MÓDULO ES ISOMORFO A PROPÓSITO
 * -----------------------------------
 * Lo importan las rutas de servidor (para validar la petición y construir la
 * respuesta) y el store del navegador (para construir la petición y leer la
 * respuesta), igual que `src/lib/interview-tickets/contracts.ts`. Por eso no
 * lleva `server-only` y no toca la base de datos: el hash y las consultas viven
 * en `service.ts`.
 */

/**
 * Tope de longitud del `accessToken` aceptado.
 *
 * El token que emite el servidor son 32 bytes en base64url sin relleno, o sea 43
 * caracteres. El tope es holgado para no atarse a ese formato exacto, pero
 * acotado para no pasar cadenas arbitrariamente largas a la base de datos.
 */
export const MAX_INFO_SESSION_TOKEN_LENGTH = 128;

/**
 * Estados que el cliente público puede fijar.
 *
 * Son exactamente los tres que hoy fija el navegador: `active` en la creación
 * (`infoSessionStore.createSession`) y `closed_presential` / `closed_remote` al
 * cerrar (`updateSessionStatus`, invocado por
 * `src/components/informes/ClosingPresential.tsx` y `ClosingRemote.tsx`).
 *
 * `completed` NO está en la lista, y esa omisión es el punto: es el estado que
 * fija el asesor autenticado desde su panel, y es el que la pantalla del cliente
 * espera para mostrar "el asesor te atendió". Si el cliente pudiera fijarlo,
 * podría fabricar esa confirmación por su cuenta. `conversion_result` queda
 * fuera por lo mismo: es la valoración comercial del asesor, no un dato que
 * declare el cliente.
 */
export const INFO_SESSION_CLIENT_STATUSES = [
  'active',
  'closed_presential',
  'closed_remote',
] as const;

export type InfoSessionClientStatus = (typeof INFO_SESSION_CLIENT_STATUSES)[number];

/** Los dos modos de cierre (`ClosingMode` en `src/types/informes.ts`). */
export const INFO_SESSION_CLOSING_MODES = ['presential', 'remote'] as const;

/**
 * Longitudes máximas de los datos de contacto.
 *
 * Ninguno exige mínimo: el formulario de `/informes/[courseId]` solo pide el
 * nombre, y el store envía cadena vacía para lo que el cliente no rellenó.
 * Rechazar `''` obligaría a distinguir "vacío" de "ausente" en el navegador y
 * tiraría la escritura entera —incluido el estado de cierre— por un campo que el
 * flujo considera opcional.
 */
const MAX_CLIENT_EMAIL_LENGTH = 320;
const MAX_CLIENT_PHONE_LENGTH = 40;
const MAX_CLIENT_TEXT_LENGTH = 200;

/** Cotas del contenido de la sesión, para acotar el tamaño del cuerpo. */
const MAX_TRANSCRIPT_ENTRIES = 2_000;
const MAX_TRANSCRIPT_CONTENT_LENGTH = 20_000;
const MAX_OBJECTION_ENTRIES = 200;
const MAX_OBJECTION_TEXT_LENGTH = 5_000;

const clientEmailSchema = z.string().trim().max(MAX_CLIENT_EMAIL_LENGTH);
const clientPhoneSchema = z.string().trim().max(MAX_CLIENT_PHONE_LENGTH);
const clientTextSchema = z.string().trim().max(MAX_CLIENT_TEXT_LENGTH);

/**
 * Turno de la transcripción (`InfoSessionTranscriptEntry`).
 *
 * `looseObject` porque la transcripción la produce la conversación con el modelo
 * y puede ganar campos con el tiempo (hoy `phase` es opcional). Tirar la
 * sincronización entera por una clave extra sería perder la transcripción del
 * cliente, que es justo lo que esta escritura existe para conservar.
 */
const infoSessionTranscriptEntrySchema = z.looseObject({
  role: z.enum(['assistant', 'user']),
  content: z.string().max(MAX_TRANSCRIPT_CONTENT_LENGTH),
  timestamp: z.number(),
  phase: z.string().max(MAX_CLIENT_TEXT_LENGTH).optional(),
});

/** Objeción detectada por el modelo durante la sesión (`DetectedObjection`). */
const infoSessionObjectionSchema = z.looseObject({
  type: z.string().max(MAX_CLIENT_TEXT_LENGTH),
  clientMessage: z.string().max(MAX_OBJECTION_TEXT_LENGTH),
  aiResponse: z.string().max(MAX_OBJECTION_TEXT_LENGTH),
  resolved: z.boolean(),
  timestamp: z.number(),
});

/**
 * Cuerpo de la ruta de creación.
 *
 * NO acepta `orgId`. El store lo tenía a mano porque cargaba el curso con la
 * clave anon, pero un `org_id` que llega del cliente es un `org_id` elegido por
 * el cliente: bastaría cambiarlo para colgar la sesión de otra organización y
 * meterla en el panel de un asesor ajeno. El servidor lo resuelve leyendo
 * `courses` por `courseId` (ver `createInfoSession`).
 */
export const infoSessionCreateRequestSchema = z.strictObject({
  courseId: z.string().uuid(),
  clientName: z.string().trim().min(1).max(MAX_CLIENT_TEXT_LENGTH),
  clientEmail: clientEmailSchema.optional(),
  clientPhone: clientPhoneSchema.optional(),
  clientOccupation: clientTextSchema.optional(),
  courseFor: clientTextSchema.optional(),
  // `null` es un valor legítimo: es lo que el store envía cuando el cliente no
  // rellenó la edad, que es opcional en el formulario.
  clientAge: z.number().int().min(0).max(120).nullable().optional(),
});

export type InfoSessionCreateRequest = z.infer<typeof infoSessionCreateRequestSchema>;

/**
 * Campos que el flujo del cliente puede modificar.
 *
 * La lista blanca de columnas NO es una comprobación que se pueda olvidar en la
 * ruta: es la forma del esquema. `strictObject` rechaza cualquier clave que no
 * esté aquí, así que `status` fuera de los tres valores del cliente,
 * `conversion_result`, `coach_notified`, `org_id` o `course_id` no tienen camino
 * hasta la base de datos aunque alguien los envíe.
 *
 * `closingMode` admite `null` porque el store envía `closing_mode: closingMode`
 * y esa variable es `null` hasta que el cliente elige un modo de cierre.
 */
export const infoSessionPatchSchema = z
  .strictObject({
    transcript: z.array(infoSessionTranscriptEntrySchema).max(MAX_TRANSCRIPT_ENTRIES).optional(),
    objectionsDetected: z
      .array(infoSessionObjectionSchema)
      .max(MAX_OBJECTION_ENTRIES)
      .optional(),
    status: z.enum(INFO_SESSION_CLIENT_STATUSES).optional(),
    closingMode: z.enum(INFO_SESSION_CLOSING_MODES).nullable().optional(),
    clientEmail: clientEmailSchema.optional(),
    clientPhone: clientPhoneSchema.optional(),
  })
  // Un `patch` vacío llegaría a la base como un `UPDATE` que solo toca
  // `updated_at`: ruido de escritura sin intención detrás. Se rechaza aquí para
  // que la ruta no tenga que distinguir "no había nada que escribir" de "no se
  // pudo escribir".
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field is required',
  });

export type InfoSessionPatch = z.infer<typeof infoSessionPatchSchema>;

/**
 * Cuerpo de la ruta de escritura.
 *
 * El `accessToken` va en el cuerpo y no en la URL porque es una credencial: un
 * token en la ruta o en la cadena de consulta queda registrado en los logs de
 * acceso del proxy y del servidor, en el historial del navegador y en la
 * cabecera `Referer` de cualquier recurso externo que la página cargue después.
 */
export const infoSessionUpdateRequestSchema = z.strictObject({
  sessionId: z.string().uuid(),
  accessToken: z.string().trim().min(1).max(MAX_INFO_SESSION_TOKEN_LENGTH),
  patch: infoSessionPatchSchema,
});

export type InfoSessionUpdateRequest = z.infer<typeof infoSessionUpdateRequestSchema>;

/**
 * Cuerpo de la ruta de estado.
 *
 * Es conceptualmente una lectura, pero exige la misma credencial que la
 * escritura: sin ella devolvería el estado de la sesión de cualquiera. Por eso
 * también viaja en el cuerpo de un `POST`.
 */
export const infoSessionStateRequestSchema = z.strictObject({
  sessionId: z.string().uuid(),
  accessToken: z.string().trim().min(1).max(MAX_INFO_SESSION_TOKEN_LENGTH),
});

export type InfoSessionStateRequest = z.infer<typeof infoSessionStateRequestSchema>;

/**
 * Respuesta de la creación.
 *
 * `accessToken` sale EN CLARO y solo aquí: es la única vez que existe fuera del
 * navegador del cliente. En la base queda únicamente su hash, así que ni un
 * volcado de `info_sessions` ni una consulta con `service_role` permiten
 * reconstruirlo.
 */
export const infoSessionCreatedResponseSchema = z.strictObject({
  status: z.literal('created'),
  sessionId: z.string(),
  accessToken: z.string(),
});

/**
 * Rechazo de la creación: el curso no existe o no está activo.
 *
 * Los dos casos comparten respuesta a propósito. Distinguirlos convertiría la
 * ruta en un confirmador de cursos ocultos, y para el cliente el resultado es el
 * mismo: no hay sesión que iniciar.
 */
export const infoSessionCourseNotFoundResponseSchema = z.strictObject({
  status: z.literal('course_not_found'),
});

export const infoSessionCreateResponseSchema = z.union([
  infoSessionCreatedResponseSchema,
  infoSessionCourseNotFoundResponseSchema,
]);

export type InfoSessionCreateResponse = z.infer<typeof infoSessionCreateResponseSchema>;

/**
 * Respuesta de la escritura.
 *
 * `unauthorized` cubre las tres formas de no tener derecho a escribir: la sesión
 * no existe, el token no corresponde a esa sesión, o la fila ya no está. Son
 * indistinguibles a propósito: separarlas diría si un `sessionId` existe.
 */
export const infoSessionWriteResponseSchema = z.strictObject({
  status: z.enum(['updated', 'unauthorized']),
});

export type InfoSessionWriteResponse = z.infer<typeof infoSessionWriteResponseSchema>;

/**
 * Respuesta del estado.
 *
 * `sessionStatus` es texto libre y no el enum del cliente: el valor que la
 * pantalla espera (`completed`) lo escribe el asesor, y la columna es `TEXT` sin
 * `CHECK`. Un enum aquí haría que un estado nuevo en el panel rompiera la
 * pantalla del cliente en lugar de simplemente no activar el aviso.
 */
export const infoSessionStateOkResponseSchema = z.strictObject({
  status: z.literal('ok'),
  sessionStatus: z.string(),
  coachNotified: z.boolean(),
});

export const infoSessionUnauthorizedResponseSchema = z.strictObject({
  status: z.literal('unauthorized'),
});

export const infoSessionStateResponseSchema = z.union([
  infoSessionStateOkResponseSchema,
  infoSessionUnauthorizedResponseSchema,
]);

export type InfoSessionStateResponse = z.infer<typeof infoSessionStateResponseSchema>;

/** Estados de rechazo: los que no entregan ni crean nada. */
export const INFO_SESSION_REJECTED_STATUSES = ['course_not_found', 'unauthorized'] as const;

export type InfoSessionRejectedStatus = (typeof INFO_SESSION_REJECTED_STATUSES)[number];

/**
 * Código HTTP por estado de rechazo.
 *
 * `unauthorized` responde `403` y no `401`: no falta una autenticación que el
 * cliente pueda aportar negociando, es que la credencial presentada no vale para
 * esa fila. El cuerpo nunca añade detalle sobre qué falló.
 */
export const INFO_SESSION_REJECTED_STATUS_CODES: Record<InfoSessionRejectedStatus, number> = {
  course_not_found: 404,
  unauthorized: 403,
};
