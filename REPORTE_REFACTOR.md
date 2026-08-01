# Reporte de auditoría y refactorización — Reclutify

**Base:** `8c92f6e` · **Rama:** `refactor/security-audit-hardening` · **50 commits**

**Verificación:** `npm run verify` en verde — `tsc --noEmit` sin errores, ESLint con
0 errores sobre todo `src/`, 905 pruebas en 57 archivos, `next build` correcto.

---

## Contexto: qué estaba ya bien

El proyecto **no** estaba sin endurecer. Había pasado por al menos dos rondas previas
—visibles en `.kiro/specs/public-flow-authorization-hardening/` y en la serie de
migraciones `2026073x`–`2026080x`— y varios módulos son de calidad notable:

- `src/lib/candidate-results/access-proof.ts` resuelve correctamente «quién puede
  actuar sobre esta entrevista» para los tres caminos de entrada.
- `src/lib/authz/org-role-authorization.ts` documenta por qué la pertenencia se
  comprueba en dos tablas y no en una.
- `src/lib/app-url.ts` explica por qué las URLs no se derivan de las cabeceras.
- `src/lib/jobs/public-projection.ts` impide que la rúbrica salga en el portal público.
- Ningún `getSession()` en código de producción: ya se había sustituido por `getUser()`.
- Todo `training/*` (24 rutas) con sesión, organización y Zod.

**El problema era el reparto.** El endurecimiento había cubierto el centro de
capacitación y el flujo público de vacantes, y había dejado intacto el **núcleo del
negocio**: la entrevista con Zara, la evaluación, el correo, el vídeo y las
integraciones. Trece rutas sin ninguna comprobación, junto a veinticuatro con todas.

Un factor lo explica: `eslint.config.mjs` ignoraba veintidós rutas de `src/`, con el
comentario `para que lint pase con 0`. Entre ellas `src/components/**`,
`src/app/actions/**`, `src/app/admin/**` y `src/middleware.ts`. El linter no miraba
donde estaban los problemas.

---

## 1. Vulnerabilidades de seguridad encontradas y corregidas

Cada una se verificó leyendo el código y, donde importaba, el estado final del
esquema tras aplicar todas las migraciones. Las que el audit inicial marcó como
críticas y **no** lo eran están en la sección 6.

### 1.1 Escritura arbitraria en el bucket de vídeo — CRÍTICA

`/api/upload-video`, sin sesión ni credencial:

```ts
const { filename, contentType } = body;
const key = filename;                         // ← la clave, tal cual
const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({
  Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: resolvedContentType,
}), { expiresIn: 900 });
```

Una petición anónima obtenía permiso de escritura de 15 minutos sobre **cualquier
objeto del bucket**: sobrescribir la grabación de otro candidato (la prueba en la que
se apoya una decisión de contratación), subir contenido arbitrario con el tipo MIME
que se quisiera —y el bucket se sirve público, así que `text/html` ahí es XSS
almacenado en un dominio de la empresa— y usarlo como almacenamiento gratuito.

**Corregido:** credencial de entrevista obligatoria; el cliente ya no envía
`filename`, declara a qué entrevista pertenece la grabación y el servidor deriva la
clave (`interview-recordings/{orgId}/{roleId}/{resultId}.{ext}`) con el `orgId` que
acredita la credencial; lista blanca de extensión y tipo MIME, fijado en la firma para
que R2 rechace lo que no coincida.

### 1.2 Dos relés de correo abiertos en el dominio de la empresa — CRÍTICA

`/api/send-email` no exigía nada y enviaba con la plantilla y la marca reales desde
`hola@reclutify.com`. `link` iba directo a `href="${link}"`, así que el botón
«Comenzar Entrevista Ahora» apuntaba donde quisiera el llamante, y `candidateName` y
`roleTitle` se interpolaban en el HTML sin escapar. `/api/notifications` era lo mismo
vía Resend, con `emailTo` arbitrario.

El daño no se limita a los engañados: una campaña de phishing saliendo de la cuenta de
Brevo de la empresa quema la reputación del dominio y manda a spam los correos
legítimos de invitación, que son el canal principal del producto.

**Corregido:** sesión de organización obligatoria; `assertSelfHostedLink` exige que el
enlace resuelva al origen configurado del despliegue (comparación de `origin`
completo, no `endsWith`, que aceptaría `reclutify.com.atacante.net`); `escapeHtml` en
todo lo interpolado; tope de tasa. `/api/notifications` **ya no acepta `emailTo`**:
avisa a la cuenta autenticada, lo que elimina el relé en vez de restringirlo.

Mismo patrón corregido en `coach-settings.sendTeamInvitationEmail`, que solo
comprobaba que hubiera sesión: cualquier cuenta, incluida una de candidato, podía
enviar una invitación con la marca de la empresa a cualquier dirección.

### 1.3 Dos SSRF sin autenticar, con oráculo — CRÍTICA

`/api/test-integration` y `/api/webhooks/candidate-completed` hacían `fetch` a una URL
del cuerpo, sin sesión, y devolvían el código de estado del destino. Desde dentro de
la red del despliegue eso permite leer el servicio de metadatos de la plataforma
(`169.254.169.254`, que en varios proveedores entrega credenciales temporales de la
instancia), enumerar la red interna usando el estado y la latencia como señal, y
alcanzar servicios que autorizan por origen de red.

El del webhook era peor: `webhookSecret` **también** venía del cuerpo. Quien conociera
el secreto de un cliente podía entregarle un `interview.completed` inventado con la
puntuación y la recomendación que quisiera, correctamente firmado y con nuestro
servidor como origen. El receptor lo habría validado como auténtico.

**Corregido:** sesión o credencial de entrevista obligatoria; `assertSafeOutboundUrl`
exige HTTPS, puerto estándar, y que el nombre **resuelva** a una dirección enrutable
(el paso que atrapa el dominio público apuntando a `127.0.0.1`); `redirect: 'manual'`
para que un `302` no eluda la validación; el destino y el secreto del webhook se leen
de `webhook_configs` para la organización acreditada, así que el cliente ya no elige a
dónde conecta el servidor ni con qué firma; los cuerpos de error de los proveedores
dejan de devolverse al cliente.

### 1.4 SSRF con exfiltración en el aviso de evaluación — CRÍTICA

`/api/evaluate`, al terminar:

```ts
const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
await fetch(`${origin}/api/notifications`, { method: 'POST', body: JSON.stringify({ ... }) });
```

`Origin` la controla quien llama por completo. Con `Origin: https://atacante.example`
el servidor enviaba a ese host el nombre del candidato, su puntuación y la
recomendación de contratación.

Lo notable es que el propio repositorio ya documentaba por qué esto no se debe hacer:
`src/lib/app-url.ts` existe exactamente para eso y su comentario de cabecera lo razona.
Esta ruta simplemente no lo usaba.

**Corregido:** el salto HTTP desaparece. El manejador y el destinatario viven en el
mismo proceso, así que se llama a la función directamente
(`sendRecruiterInterviewNotification`). Con eso caen a la vez el SSRF, una ida y
vuelta de red, un salto de autenticación y el modo de fallo de que la ruta interna
estuviera caída.

### 1.5 Fuga de datos personales entre organizaciones — CRÍTICA

`20260507_interview_telemetry.sql:37`:

```sql
CREATE POLICY "Enable read access for authenticated users"
  ON public.interview_telemetry FOR SELECT TO authenticated USING (true);
```

`USING (true)` sin filtro por organización. Y esa tabla no guarda contadores: guarda
`prompt_text` —el prompt completo de `/api/chat`, que incrusta el CV extraído del
candidato: nombre, correo, teléfono, historial laboral y las banderas rojas
detectadas—, `response_text`, `candidate_name`, `role_title` y `raw_payload`, que era
**el cuerpo entero de la petición, incluido `cvData`**.

El registro de cuenta es abierto, así que «estar autenticado» no acota nada:
cualquiera podía crearse una cuenta de candidato y descargar los CV y las
transcripciones de los candidatos de todas las empresas clientes.

`202608010006` retiró la política de INSERCIÓN de esta misma tabla, pero no la de
LECTURA, que es la que expone los datos.

**Corregido:** la política se retira (`202608020002`). El único consumidor,
`/admin/telemetry`, lee con la clave de servicio, así que no se afecta. Se retira en
lugar de reescribirse con filtro porque la tabla **no tiene columna de organización**;
un filtro correcto exigiría añadirla y rellenarla retroactivamente, y hasta entonces
la única política segura es ninguna.

Además, `raw_payload` deja de guardar el cuerpo: `summarizeChatPayload` guarda
contadores y banderas, y el CV se reduce a indicadores de presencia.

### 1.6 Inserción de notificaciones abierta a `anon` — CRÍTICA

`20260509_notifications.sql:16`:

```sql
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
```

Sin cláusula `TO`, una política aplica a **todos** los roles, `anon` incluido. Y la
clave `anon` viaja al navegador en cada carga. Cualquiera, sin cuenta, podía insertar
notificaciones con cualquier `user_id`, `title`, `body` y `link`. `NotificationBell`
pinta esos tres campos, así que es un canal de phishing **dentro del producto**,
dirigible a un usuario concreto.

**Corregido:** se retira. Las notificaciones legítimas las escriben cuatro triggers
`SECURITY DEFINER` de la propia base, que no están sujetos a las políticas de la tabla,
así que siguen funcionando. Se verificó que ninguna ruta ni action hace
`.from('notifications').insert(...)`.

### 1.7 Estado de facturación de toda la cartera, público — ALTA

`20260510_company_pages.sql:12` creó `public_company_select ON organizations FOR
SELECT TO anon, authenticated USING (true)` para publicar la ficha de empresa. Desde
`20260528_stripe_subscriptions.sql` esa tabla tiene `stripe_customer_id`,
`stripe_subscription_id`, `subscription_status`, `subscription_period_end` y
`billing_interval`.

Con la clave anon del bundle se podía descargar la lista de clientes con su
identificador de cliente de Stripe y su estado de suscripción: quién ha dejado de
pagar (`past_due`), quién está en prueba, cuándo vence cada contrato. Es inteligencia
comercial de la cartera completa.

**Corregido:** RLS filtra filas, no columnas, así que la corrección es un `REVOKE
SELECT` a nivel de columna sobre las cinco sensibles. `plan_tier` no se revoca: no es
sensible y gobierna la marca blanca del encabezado. Los tres lectores pasan al cliente
de servicio: una nueva action `getOrgBillingSummary` para la interfaz —que devuelve un
booleano `hasBillingAccount` en vez del identificador— y `/api/stripe/checkout` y
`/api/stripe/portal`, que ya resolvían la organización desde el perfil del propio
usuario autenticado, así que el cambio de cliente no relaja ninguna comprobación.

### 1.8 Cero limitación de tasa en todo el proyecto — CRÍTICA

Ningún endpoint la tenía. Los que llaman a OpenRouter facturan por token, y
`/api/chat` envía el prompt completo —rúbrica, CV e historial— en **cada turno**. Un
bucle de `curl` de una línea agotaba el saldo de la cuenta. `/api/tts` sintetizaba
textos de cualquier tamaño; `/api/public-interview` insertaba una fila en
`candidate_results` por petición, así que un bucle llenaba el pipeline de la empresa.

**Corregido:** limitador de ventana fija en Postgres (`202608020001`) con ocho topes
por función. Se descartó Upstash porque exigiría dos variables de entorno nuevas y
obligatorias, y un despliegue que no las configure se queda otra vez sin protección,
que es la situación que se está corrigiendo. Si la RPC no está disponible se cae a un
contador en memoria —acota por instancia, no globalmente— y se avisa una vez: la
alternativa, fallar cerrado, convertiría una incidencia del limitador en una caída de
las entrevistas en curso, y una entrevista interrumpida a mitad no se recupera.

### 1.9 Trece rutas sin autenticación ni validación — CRÍTICA

| Ruta | Antes | Ahora |
|---|---|---|
| `/api/chat` | nada | credencial + Zod + tope |
| `/api/evaluate` | nada | credencial + Zod + tope |
| `/api/tts` | nada | Zod + tope (ver 6.1) |
| `/api/upload-video` | nada | credencial + Zod + tope |
| `/api/send-email` | nada | sesión org + Zod + tope |
| `/api/notifications` | nada | sesión org + Zod + tope |
| `/api/test-integration` | nada | sesión org + Zod + anti-SSRF + tope |
| `/api/webhooks/candidate-completed` | nada | credencial/sesión + anti-SSRF + tope |
| `/api/generate-rubric` | nada | sesión org + Zod + tope |
| `/api/generate-course-topics` | nada | sesión org + Zod + tope |
| `/api/parse-course-document` | nada | sesión org + tope |
| `/api/parse-resume` | nada | tope (ver 6.1) |
| `/api/public-interview` | nada | Zod + tope (público por diseño) |
| `/api/info-chat` | nada | Zod + tope (público por diseño) |
| `/api/info-notify` | validación parcial | Zod + tope (público por diseño) |

### 1.10 Inyección de filtro PostgREST — ALTA

`search.ts` interpolaba el término en `.or()`:

```ts
q.or(`full_name.ilike.%${query}%,headline.ilike.%${query}%,...`)
```

El argumento de `.or()` no es un valor parametrizado: es la **gramática de filtros de
PostgREST**. La coma separa condiciones, el punto separa columna, operador y valor. Con
`query = "x,is_open_to_work.eq.true"` el llamante **añade condiciones**, y como `or`
acepta cualquier columna de la tabla, controla qué columnas se consultan. Es un oráculo
booleano sobre columnas que el `select` no devuelve.

**Corregido:** `sanitizeFilterTerm` **elimina** los metacaracteres de la gramática y de
`LIKE` en lugar de escaparlos: un término legítimo de este producto —un nombre, un
puesto, una tecnología— no contiene comas ni comodines, así que quitarlos no degrada
ninguna búsqueda real y no deja casos límite de escapado que revisar. Un `%` suelto,
además, convertía la búsqueda en un recorrido completo de la tabla.

### 1.11 Asignación masiva con escalada de plan — ALTA

`company.updateCompanyProfile` pasaba el objeto recibido directo a `.update(updates)`.
El **tipo** de TypeScript declaraba siete campos, pero un tipo no es una comprobación
en tiempo de ejecución: una server action recibe su argumento serializado desde el
navegador. Un `updates` con `{ plan_tier: 'enterprise' }` pasaba la comprobación de
permisos —el usuario **es** admin de su organización— y se auto-concedía el plan más
caro.

**Corregido:** lista blanca explícita. Blanca y no negra: una columna nueva en la tabla
queda fuera por defecto en vez de dentro hasta que alguien se acuerde de excluirla.

### 1.12 Acceso a grupos privados — ALTA

`joinGroup` insertaba la fila sin mirar la privacidad del grupo, y la política
`gm_insert` es `WITH CHECK (user_id = auth.uid())`: comprueba que te unes **a ti
mismo**, no que el grupo admita a cualquiera. Así que la base tampoco lo impedía.
Cualquier usuario autenticado podía unirse a un grupo privado con su identificador y,
dentro, leer sus publicaciones vía `gp_select`.

**Corregido:** se comprueba `privacy` antes de insertar, con el mismo mensaje para «no
existe» y «es privado» para no permitir enumerar los grupos privados.

### 1.13 Falta de autenticación en operaciones destructivas — CRÍTICA

`courses.getCourseById`, `toggleCourseActive` y `deleteCourse` **no llamaban a
`getUser()`**. Cualquiera podía desactivar o eliminar el curso de cualquier empresa con
su identificador. La única defensa era RLS, y la tabla `courses` **no tiene migración
en el repositorio** (ver 6.3), así que sus políticas no se pueden afirmar.

**Corregido:** sesión y pertenencia a la organización dueña del curso.

### 1.14 Sin política de seguridad de contenido — ALTA

Había seis cabeceras de seguridad y faltaba la CSP, que es la que limita el daño de un
XSS que se cuele por un fallo de sanitización aún desconocido.

**Corregido:** CSP con orígenes derivados del uso real, no supuestos —no aparece
`openrouter.ai` porque esas llamadas son de servidor a servidor—, más
`Cross-Origin-Opener-Policy`. `frame-ancestors 'none'` importa especialmente aquí: la
sala de entrevista pide cámara y micrófono, así que un iframe ajeno sería clickjacking
sobre esos permisos.

### 1.15 `search_path` sin fijar en siete triggers `SECURITY DEFINER` — MEDIA

`202607290004` fijó `search_path` en las funciones de capacitación y de Stripe, pero
dejó fuera los siete triggers del feed social. Una función `SECURITY DEFINER` sin
`search_path` fijo resuelve los nombres sin cualificar con el de la sesión que la
dispara; quien pueda crear objetos en un esquema que preceda a `public` puede
sustituir una tabla y ejecutarla con los privilegios del propietario.

**Corregido:** `ALTER FUNCTION ... SET search_path`, idempotente y sin cambiar el
cuerpo de ninguna.

### 1.16 Segundo proveedor de autenticación muerto en el árbol — MEDIA

`ClerkProvider` envolvía toda la aplicación y había dos rutas (`/sign-in`, `/sign-up`)
renderizando widgets de Clerk sin configurar. La autenticación es Supabase de
principio a fin; Clerk no autenticaba nada. El coste que importa no es el bundle: son
**dos sistemas de autenticación aparentes** en el código, que es la clase de ambigüedad
que hace que una revisión de seguridad mire el sitio equivocado.

**Corregido:** eliminado con sus rutas y la entrada `/__clerk/(.*)` del `matcher`.

### 1.17 Las dos rutas del asesor virtual sin acotar — ALTA

`/api/info-chat` (495 líneas) llama a un modelo con `max_tokens: 500` y razonamiento
activado —de las llamadas más caras del proyecto— sin validación de entrada y sin tope
de tasa. `/api/info-notify` inserta en `coach_notifications` y envía correo con Resend,
también sin tope.

Estas dos aparecieron **al final**, volviendo a ejecutar la matriz de protección de
endpoints en lugar de confiar en la pasada anterior. Es la razón de que la matriz esté
en el repositorio como comprobación reproducible y no como una revisión puntual.

**Corregido:** Zod con topes de longitud —todo el cuerpo se interpola en el prompt: el
curso, sus objetivos, sus planes con precios, los testimonios y los ganchos de
urgencia— y tope de tasa. No se exige sesión, por el mismo motivo que en `/api/tts`
(ver 6.1): la página `/informes/[courseId]` es pública y sus visitantes no tienen
cuenta. El `type` de `info-notify` pasa de cadena libre a enum cerrado, porque se
escribía tal cual en la base y elegía el asunto del correo.

### 1.18 Credenciales de terceros enviadas al navegador — ALTA

`coach_settings.integrations` guarda credenciales de sistemas de OTRAS personas: el
JSON completo de una cuenta de servicio de Google con su clave privada PEM, el Private
App Token de HubSpot, el token de Notion y el secreto de firma del webhook.
`coachSettingsStore` las leía con `select('*')` DESDE EL NAVEGADOR, lo que las pone en la
respuesta HTTP, en el montón de JavaScript y en la pestaña de red.

Con RLS correcto solo las ve la organización dueña, así que no es una fuga entre
clientes. Importa igual por tres razones: son credenciales de terceros, así que quien las
capture —una extensión del navegador, un XSS— hace daño en el CRM del cliente y no en el
nuestro; la tabla `coach_settings` **no tiene migración en este repositorio** (ver 6.3),
así que su RLS no se puede afirmar, y un control que no se puede verificar no es un
control; y la interfaz no las necesita, solo necesita saber si están configuradas.

**Corregido:** la lectura pasa por una server action que sustituye cada secreto por el
marcador `'__SAVED__'`; la escritura los recompone. Esa recomposición no es un adorno:
como la interfaz recibe el marcador, al guardar volvería a subirlo, y sin recomponer el
usuario sobrescribiría su clave real con la cadena del marcador y **destruiría su propia
integración por pulsar «Guardar» sin tocar nada**.

Se aplica la misma redacción a la action antigua, que ya no se usa: dejar un camino con
fuga porque hoy nadie lo recorre es dejar la fuga.

Una corrección al audit inicial: `partialize` solo persistía `notificationSound`, así que
los secretos nunca estuvieron en `localStorage`.

---

## 2. Bugs funcionales corregidos

### 2.1 `POST {}` a `/api/chat` devolvía 500

`Math.min(topicStartIndex || 0, recentMessages.length)` sobre `undefined`. Cualquier
cuerpo malformado reventaba a mitad del manejador. **Ahora:** `400` con el campo que
falta.

### 2.2 Telemetría perdida en los turnos lentos

`logTelemetry(...)` se llamaba sin `await` y sin `.catch()`. En serverless la
instancia puede congelarse en cuanto se devuelve la respuesta, así que la telemetría
se perdía **precisamente en los turnos lentos**, los que interesa depurar.
**Ahora:** se espera; `logInterviewTurn` no lanza, así que no puede fallar la petición.

### 2.3 Segunda llamada al modelo, pagada y descartada

`/api/chat` lanzaba un análisis de sentimiento en paralelo en cada turno y devolvía
`sentiment: null`. Se pagaba una llamada por turno cuyo resultado se tiraba.
**Ahora:** retirada; la clave se mantiene en la respuesta por compatibilidad.

### 2.4 Cancelación no propagada

Ninguna ruta pasaba `request.signal` al `fetch` del proveedor, así que si el candidato
cerraba la pestaña o pasaba de turno la llamada se pagaba completa. Y tres rutas no
tenían **ningún** tope de tiempo, así que una llamada colgada consumía el tiempo de
ejecución entero de la función. **Ahora:** ambos, en el cliente compartido.

### 2.5 Destinatario del aviso incrustado

`/api/evaluate` avisaba a `'recruiter@reclutify.com'`, una dirección del proveedor, no
del cliente. La función anunciada —«el equipo de evaluación recibe un correo»— no
ocurría para ningún cliente. **Ahora:** se resuelve el `owner` de la organización.

### 2.6 `Date.now()` durante el render

En el JSON-LD de `career-fair/[roleId]` y en `NotificationBell`. Produce un valor
distinto en cada render: discrepancia de hidratación y caché invalidada. **Ahora:** la
vacante caduca 90 días después de **publicarse**, que además es lo que significa el
campo; el tiempo relativo se ancla al montaje.

### 2.7 `useRef` leído durante el render para decidir qué pintar

`FeedList` usaba `initialLoad.current` para elegir entre esqueleto y contenido. Un ref
no provoca re-render, así que el componente podía quedarse en el esqueleto **después**
de que la carga terminara, hasta que otro cambio lo repintara por casualidad.
**Ahora:** estado para lo que se pinta, ref solo para coordinar el efecto.

### 2.8 Variable usada antes de declararse

`my-jobs` llamaba a `loadData()` desde un `useEffect` declarado **antes** del `const`.
Funcionaba solo porque los efectos corren tras el primer render. **Ahora:**
`useCallback` declarado antes del efecto.

### 2.9 Tres `<a>` hacia rutas internas

Recarga completa de página en lugar de navegación de cliente, perdiendo todo el
estado. **Ahora:** `next/link`.

### 2.10 `window.SpeechRecognition` declarado como obligatorio

`speech.d.ts` lo declaraba requerido. Safari solo expone la variante `webkit`, así que
el tipo describía un navegador que no existe y obligaba a `(window as any)` en cada
uso. **Ahora:** opcional, y los casts retirados.

### 2.11 Ocho `catch (err: any)` seguidos de `err.message`

`err` no es necesariamente un `Error`: un `throw 'texto'` produce `err.message`
`undefined` y el usuario ve el texto por defecto en vez de la causa. **Ahora:**
`unknown` y un único helper de extracción.

### 2.12 Fuga de memoria en la exportación de CV

`revokeObjectURL` estaba en el camino feliz, así que un fallo a mitad retenía el blob
del PDF hasta recargar. **Ahora:** en `finally`.

### 2.13 `npm test` colgaba en CI

Abría vitest en modo vigilancia. **Ahora:** `test:run`, `typecheck` y `verify`.

### 2.14 `server-only` como dependencia transitiva

32 archivos lo importan directamente, pero se resolvía a través de `@clerk/nextjs`.
Quitar Clerk rompió las 24 suites de capacitación. **Ahora:** dependencia directa. Es
la fragilidad exacta que aparece en un cambio no relacionado.

### 2.15 Mensajes de excepción devueltos al cliente

`/api/tts` y `/api/test-integration` devolvían `err.message`, que en un fallo de
`fetch` incluye la URL y el host del proveedor; `test-integration` además interpolaba
los cuerpos de error de Google, HubSpot y Notion. **Ahora:** `handleApiError`; el
detalle va al log.

### 2.16 Contenido de la entrevista en los logs

`/api/chat` volcaba diez líneas por turno con tema, puesto, temporizador y los
primeros 200 caracteres de la respuesta; `/api/tts` registraba 80 caracteres de cada
texto sintetizado. En una entrevista eso es la conversación en los logs,
indefinidamente. **Ahora:** retirados.

### 2.17 Identificador de fila predecible

`/api/public-interview` generaba `cr-${Date.now()}-${Math.random()...}`, y ese
`resultId` es lo que el cliente usa después para escribir su propia entrevista.
**Ahora:** `randomUUID()`.

### 2.18 Hueco en la propia guardia anti-SSRF

Escrita en esta ronda: solo comprobaba la forma decimal de las IPv4 mapeadas
(`::ffff:127.0.0.1`), pero `new URL()` la normaliza a hexadecimal (`::ffff:7f00:1`), es
decir **la única notación que llega en la práctica**. Lo detectó la prueba
`rechaza loopback en IPv6 y su forma mapeada de IPv4`. Corregido.

### 2.19 Cámara y micrófono seguían capturando tras salir de la entrevista

El cleanup del `useEffect` general de `InterviewRoom` limpiaba temporizadores,
reconocimiento de voz, `AudioContext` y la URL de objeto del audio, pero **no detenía
`streamRef` (las pistas de cámara y micrófono) ni `mediaRecorderRef`**. Solo lo hacía
`endInterview()`.

Si el componente se desmontaba por NAVEGACIÓN —botón atrás, cerrar la pestaña de la
entrevista, un error boundary de un ancestro— las pistas quedaban vivas. El síntoma
visible es el LED de la cámara encendido después de salir; el real es que se sigue
capturando cámara y micrófono de alguien que ya se fue de la pantalla. Para una aplicación
que graba entrevistas eso no es una fuga de memoria: es un problema de privacidad.

Los fragmentos grabados —decenas de megabytes de vídeo— tampoco se vaciaban.

### 2.20 Doble arranque de la entrevista duplicaba el temporizador

`startInterview` creaba el `setInterval` sin limpiar el anterior. Un doble clic en el
botón sobrescribía `timerRef.current`, así que el primer intervalo quedaba corriendo sin
referencia y ni `endInterview` ni el cleanup podían alcanzarlo. El síntoma es un
temporizador que avanza al doble de velocidad y una entrevista que entra en periodo de
gracia a mitad de su duración real.

### 2.21 El temporizador de la sesión informativa nunca se detenía

`infoSessionStore.startTimer()` se llamaba al crear la sesión y **`stopTimer()` no se
llamaba en ningún sitio del proyecto**. El `setInterval` seguía corriendo indefinidamente
después de que el visitante abandonara la página, y `startTimer` tampoco limpiaba uno
previo, así que una pestaña que recorriera varios cursos acumulaba un intervalo por sesión
iniciada.

### 2.22 Transcripción en el idioma equivocado

`src/lib/stt.ts` fijaba `recognition.lang = 'en-US'` sin ningún parámetro, en un producto
cuyo idioma por defecto es el español. **Todos los candidatos hispanohablantes se
transcribían con el modelo acústico inglés.** No produce un error visible: produce una
transcripción degradada, y esa transcripción es la entrada de `/api/evaluate`, así que la
evaluación se calculaba sobre un texto peor de lo que debía.

### 2.23 Canales de Realtime con nombre estático

Los seis canales usaban nombres fijos (`'feed-realtime'`, `'notif-rt'`, ...). Dos
instancias del mismo componente montadas a la vez —o el doble montaje del modo estricto de
React en desarrollo— pedían el MISMO canal y la segunda suscripción no se establecía. El
síntoma es una lista que deja de actualizarse en tiempo real, sin error.

Corrección al audit inicial: las seis **sí** llamaban a `removeChannel` en su cleanup. Se
comprobó una por una; la auditoría las dio por fugadas y no lo estaban.

### 2.24 Fuga de memoria en la exportación de CV, segunda vez

`revokeObjectURL` estaba en el camino feliz, así que un fallo a mitad de la generación
retenía el blob del PDF hasta recargar la página.

### 2.25 El estado de la entrevista no se anunciaba

La sala comunicaba «grabando», «procesando» y «transcribiendo» solo con color y animación.
Para quien usa lector de pantalla ese estado no existía, así que no había forma de saber
si el micrófono estaba abierto durante una entrevista de trabajo grabada.

### 2.26 Once combinaciones de estado imposibles en la sala de entrevista

`InterviewRoom` representaba la entrevista con cuatro booleanos independientes
—`isAiSpeaking`, `isRecording`, `isProcessing`, `isTranscribing`— más `hasStarted`. Cuatro
booleanos son dieciséis combinaciones y solo cinco significan algo. Entre las otras once:

    isAiSpeaking && isRecording   Zara habla con el micrófono del candidato abierto. El
                                  reconocedor transcribía la voz de Zara y ESA transcripción
                                  se enviaba al modelo como respuesta del candidato.
    isProcessing && isRecording   la respuesta se envió y se sigue grabando, así que lo que
                                  el candidato diga después se pierde.

Y las transiciones estaban escritas como PARES DE ASIGNACIONES repartidos por 2 190 líneas
(`setIsRecording(false); setIsProcessing(true)` en la 640, otro par en la 1353, tres
asignaciones en la 1588). Nada garantizaba que las dos mitades ocurrieran juntas: entre ellas
hay un renderizado que muestra una combinación imposible, y un camino que olvide una deja el
estado inconsistente para siempre.

**Corregido** con una unión discriminada de nueve estados y una tabla explícita de
transiciones (`src/lib/interview/machine.ts`, reductor puro, 42 pruebas). Las once
combinaciones dejan de ser representables, y un evento que no corresponde al estado **se
rechaza y se registra**: eso convierte «el candidato pulsó hablar mientras Zara hablaba» de
una carrera silenciosa en una línea de log con la que se puede depurar una queja concreta.

La matriz de pruebas encontró una decisión que había dejado implícita: `END` y `FAILED` se
aceptaban desde `idle`, lo que produciría una entrevista «terminada» que nunca ocurrió — y
`finished` es lo que dispara el guardado del resultado y la subida del vídeo.

### 2.27 El orbe animaba sobre silencio, con el botón habilitado

`startInterview` hacía `setIsAiSpeaking(true)` **antes** de que la petición del saludo hubiera
salido. El efecto visible es el orbe de Zara animándose sin audio; el efecto real es que los
cuatro booleanos en `false` durante ese intervalo eran indistinguibles de «Zara terminó, te
toca», así que el botón de hablar salía habilitado y un clic temprano iniciaba el turno del
candidato antes del saludo. El estado `preparing` de la máquina es ese intervalo.

### 2.28 El motivo del cierre de la entrevista no se distinguía

`endInterview()` no recibía parámetro, así que el informe no podía diferenciar «Zara recorrió
todos los temas», «se agotó el tiempo» y «el candidato pulsó terminar». Ahora es un argumento
con los tres valores, y cerrar dos veces conserva el motivo del primer cierre.

### 2.29 Una regresión CRÍTICA que introdujo mi propia máquina de estados

La documento con el mismo detalle que las demás porque es la más instructiva del informe.

Al conectar la máquina, `handleCandidateUtterance` quedó roto en tres caminos: los que
responden **sin consultar al modelo** —reformular una pregunta que el candidato no entendió, y
las dos ramas de la detección de callejón sin salida—. Los tres llaman a `speakText()` **antes**
de despachar `TRANSCRIPTION_SETTLED`, así que la máquina recibía `SPEECH_STARTED` estando en
`transcribing`. Esa transición no existía, el evento se rechazaba, y el estado se quedaba en
`transcribing` **para siempre**: botón de hablar deshabilitado, candidato sin poder continuar.

Decir «¿cómo?» habría acabado con su entrevista.

**Corregido** aceptando `SPEECH_STARTED` desde `transcribing`, que es lo que el producto hace
de verdad. NO despachando `TRANSCRIPTION_SETTLED` antes, que era la otra opción: ese evento
significa «hay texto que enviar al modelo», y estos tres caminos no envían nada.

La misma revisión encontró tres más, todos reales:

 - El botón seguía usando la fórmula de cuatro booleanos, así que **el mensaje de mi commit
   anterior afirmaba una corrección que no estaba aplicada**: durante `preparing` los cuatro
   son `false`, luego el botón salía habilitado, y un clic abría el micrófono físicamente
   mientras el despacho se rechazaba.
 - La red de seguridad del `finally` solo cubría `processing`, no `transcribing`.
 - El despachador leía un ref que solo se actualiza en un efecto, así que dos despachos en la
   misma tarea comparaban contra un estado obsoleto y el segundo podía rechazarse siendo
   válido. `finishCandidateTurn` seguido de `completeCandidateTurn` hace exactamente eso.

**Lo que enseña, y por eso está aquí:** 42 pruebas unitarias de transiciones estaban en verde
mientras la máquina tenía un fallo fatal, porque **probar transiciones sueltas no prueba
secuencias**. Se añadió un bloque que reproduce las once secuencias que el componente despacha
de verdad, en su orden real, y afirma que la lista de eventos rechazados esté VACÍA: un rechazo
a mitad de una secuencia legítima es el síntoma exacto del atasco.

Y enseña algo sobre el proceso: lo encontró una revisión independiente leyendo el componente,
no las pruebas ni yo. Someter el cambio de mayor riesgo a un revisor que no comparte el
contexto de quien lo escribió fue lo que evitó que esto llegara a producción.

### 2.30 El tope de ritmo estaba INVERTIDO: la entrevista se clavaba justo al quedarse sin tiempo

`computeRealTimePacing` calculaba el tope de preguntas por tema con un suelo de
`preguntas_hechas + 1`:

```ts
effectiveHardLimit = max(max(1, asked + 1), budget - suggestSkipQuestions)
```

La ruta de chat decide con `asked >= effectiveHardLimit`. Ese suelo garantiza que el tope
SIEMPRE supera lo ya preguntado, luego la comparación era insatisfacible y `mustAdvanceNow` **no
podía ser cierto** con urgencia `hurry` ni `critical`. Con presupuesto 4 y urgencia normal el tema
avanzaba a las 4 preguntas; con urgencia crítica el tope subía a 5, luego 6, luego 7, siguiendo a
`asked + 1`.

El efecto es el contrario del documentado: la entrevista se quedaba **clavada en un tema justo
cuando se estaba quedando sin tiempo**, y los temas restantes acababan con cero evidencia. Y como
la evaluación puntúa por tema y **un criterio sin puntuación cuenta como 0**, un candidato que
cubrió bien el tema 1 de 5 salía con ~20/100 sin culpa alguna. El bug de ritmo hundía la nota.

El segundo término tampoco servía: `suggestSkipQuestions` está topado a propósito con
`max(0, budget - asked - 1)` —«deja al menos una más»— porque es una SUGERENCIA para el prompt.
Derivar un límite duro de una sugerencia blanda que por construcción se mantiene por encima de lo
ya preguntado no podía funcionar.

El tope ahora es función de la urgencia y nunca de lo ya preguntado, con suelo de 1. Se añadió un
barrido exhaustivo —6 duraciones × 5 cantidades de temas × cada índice de tema × 5 posiciones del
reloj— que afirma que para toda combinación existe una cantidad de preguntas que fuerza el avance.

### 2.31 Otra regresión mía: el panel de telemetría devolvía cero filas

`202608020002` eliminó la única política de lectura de `interview_telemetry`, y con razón: era
`FOR SELECT TO authenticated USING (true)` sobre una tabla que guarda el CV extraído del
candidato. Pero la página seguía consultando con el cliente de **sesión**, y RLS sin políticas no
da error: devuelve vacío. Mi propio comentario en esa migración afirmaba que leía con
`service_role`, y era falso.

No se podía arreglar con una política: la tabla **no tenía por dónde filtrar**. `session_id` y
`role_title` son texto libre. La corrección fue estructural —`202608030001` añade `org_id`,
`/api/chat` lo rellena desde la autorización que ya hizo, y la página filtra por él—. Las filas
antiguas quedan en `NULL` a propósito: adivinar su organización por `role_title` significaría
enseñar el CV de un candidato a otra empresa.

De paso: la página solo exigía sesión (`if (!user) redirect`), así que cualquier cuenta
autenticada —incluido un candidato— abría el panel.

### 2.32 La cola que existía para no perder datos del candidato los perdía

`adminStore` tiene una cola en `localStorage` cuya única razón de ser es no perder los resultados
de una entrevista cuando la escritura a Supabase falla. No tenía ninguna prueba y tenía cuatro
defectos:

 1. **`attempts` se incrementaba y se guardaba, pero no se leía para decidir nada.** La única
    evicción era por antigüedad (14 días) o por la cota de 200, así que una entrada que falla
    siempre —un puesto borrado, un candidato que el servidor rechaza con 4xx— se reintentaba en
    cada carga del panel durante dos semanas.
 2. **`writeSyncQueue(remaining)` al final del recorrido pisaba lo encolado durante los `await`.**
    Y se encola: `addCandidate` lo hace justo al agotar sus tres reintentos, que es cuando la red
    va mal, que es cuando el reintento está corriendo.
 3. **Sin guarda de concurrencia.** `fetchFromSupabase` dispara `retrySyncQueue` al terminar, así
    que dos navegaciones seguidas lanzaban dos recorridos que se pisaban el resultado.
 4. **`JSON.parse(raw) as SyncQueueItem[]`**, un `as` sin comprobar nada sobre almacenamiento del
    cliente. Un JSON válido con otra forma pasaba el cast y luego `item.kind` caía en el `else`,
    enviando basura al endpoint.

### 2.33 Tres divergencias silenciosas entre la pantalla y la base

 - **Las tres acciones de puesto** aplicaban el cambio en local, fallaban contra Supabase y lo
   dejaban así. `removeRole` era el peor: el puesto desaparecía de la pantalla y seguía existiendo
   —y publicado— en la base, así que el admin creía haberlo retirado y los candidatos seguían
   pudiendo entrar. `addRole` tampoco era inocuo: `create-role` lo espera y a continuación crea
   tickets contra ese id.
 - **`ticketStore.syncAddTicket`** devolvía `void` y solo registraba errores
   `if (NODE_ENV === 'development')`. En producción, cualquier fallo era completamente silencioso:
   el admin copiaba el enlace, lo enviaba al candidato, y el candidato recibía un 404. Peor:
   `create-role` **enviaba el correo igualmente**, así que el candidato recibía una invitación a
   una entrevista que no existía.
 - **`trainingStore.sendGeneralMessage`** caía a una instantánea capturada ANTES de añadir el
   mensaje del usuario. Con un `200` sin `history`, el mensaje que la persona acababa de escribir
   desaparecía junto con la conversación, y sin error porque `response.ok` era verdadero.

### 2.34 Formularios que destruían el trabajo del reclutador

 - **«Generar Rúbrica con IA»** reemplazaba todos los criterios sin confirmar. Y su `catch`
   **sustituía los del reclutador por cinco genéricos**: el camino de error era destructivo.
 - **«Enriquecer con IA»** hacía `setTopics(enriched)`, así que pulsarlo porque a UN criterio le
   faltaba la rúbrica machacaba las de todos, incluidas las escritas a mano. El nombre del botón
   promete completar, no sustituir.
 - **Doble envío en `create-role`**: el botón solo miraba `bulkSending`, que únicamente se activa
   si hay correos que enviar. Sin lista de candidatos, un segundo clic durante el `await addRole`
   creaba OTRO puesto con su propio token público y reenviaba los correos.
 - **La subida de documento en `create-course`** reemplazaba trece campos sin confirmar. Y la
   comprobación que se añadió vivía en un `useCallback` con dependencias vacías, así que capturaba
   los valores del primer renderizado —todos vacíos— y la confirmación no se habría mostrado nunca.

### 2.35 Cuatro campos de ajustes que descartaban todo lo que se escribía

En `/coach/settings`, `orgName`, `coachName`, `contactEmail` y `timezone` vivían en `useState`
local, no se cargaban del servidor y `handleSave` no los miraba. No era un fallo de guardado: **no
existía ningún camino** que llevara esos datos a la base, y `coach_settings` no tenía columnas para
ellos. El usuario los rellenaba, guardaba, recargaba, y estaban vacíos.

Ahora el nombre de la organización va a `organizations.name` y el del coach a
`user_profiles.full_name` mediante una acción de servidor que resuelve la organización del perfil
de quien llama —no la acepta como argumento—; el correo es el de la CUENTA y pasa a solo lectura,
porque cambiarlo es cambiar de credencial; y `timezone` tiene columna propia.

### 2.36 El informe pintaba una confianza medida de 0 como 50 %

La pantalla que decide una contratación leía el mismo dato de dos formas, y las dos estaban mal en
sentidos opuestos:

```ts
e.sentiment?.confidence || 50   // en la gráfica
entry.sentiment?.confidence || 0 // en la lista, treinta líneas más abajo
```

`confidence` va de 0 a 100 y **0 es un valor válido**: el candidato no mostró ninguna seguridad. Al
ser falsy, en la gráfica pasaba a 50 —el punto medio, o sea sereno— mientras la lista lo marcaba en
rojo. El mismo turno se pintaba de dos formas contradictorias.

Y el `|| 0` tenía el error inverso: una confianza que el modelo **no midió** salía como «0 %» en
rojo, es decir evasión máxima, cuando la verdad es «no se midió». Penalizaba al candidato por un
hueco en los datos. Son tres estados y con un `number` no se pueden representar.

### 2.37 Peticiones por tecla que además rompían el tecleo

Los campos de módulo de `training/configure` llamaban al servidor en CADA pulsación, y solo
actualizaban el estado local **si el `PATCH` tenía éxito**. Con un input controlado por
`value={mod.title}`, entre la pulsación y la respuesta de la red el input volvía al valor anterior:
escribir era a saltos y se perdían caracteres. Si el `PATCH` fallaba, la letra no aparecía nunca.
Las peticiones tampoco se cancelaban, así que «Módulo de intro» podía llegar después de «Módulo de
introducción» y dejar el texto a medias en la base.

`durationEstimate` usaba `Math.max(1, Number(v))`, y `Number('-')` es `NaN`, que atraviesa
`Math.max` y acaba guardado.

### 2.38 Alta de candidato: la marca de completado iba antes que el perfil

`setupCandidateProfile` escribía `user_profiles` con `onboarding_completed: true` PRIMERO y el
perfil social después. Si la segunda escritura fallaba, la cuenta quedaba marcada como completada
sin perfil social — y el middleware decide con ese campo: al verlo en `true` dejaba de redirigir a
`/onboarding`, así que la persona entraba al producto sin perfil y nada le indicaba que tenía que
volver. El flujo de empleador sí compensaba; este no.

La marca es ahora la última escritura. Es preferible a compensar con borrados: no hay transacción
entre dos `upsert` desde el cliente, así que la compensación puede fallar ella misma.

### 2.39 Cualquier cuenta podía etiquetar la publicación de otra persona

`hashtags` y `post_hashtags` tenían tres políticas de escritura sin condición.
`post_hashtags_insert` no comprobaba de quién era la publicación, así que cualquiera podía colgar
cualquier etiqueta de la publicación de otro —y no hay política de DELETE, tampoco para el autor,
así que no se podía deshacer—. `hashtags_update USING (true)` permitía modificar `post_count`, que
ordena las tendencias, y `tag`, que es la etiqueta para todo el mundo.

Se pueden quitar las tres sin romper nada: las etiquetas las mantiene íntegramente el disparador
`process_post_hashtags`, que es `SECURITY DEFINER` y por tanto no pasa por RLS. La autorización
real es la de `posts`, que sí comprueba el autor.

### 2.40 Actualización silenciosa de cero filas

`jobs.toggleRolePublished` devolvía `success: true` cuando el `roleId` no era de la
organización, así que la interfaz informaba de un cambio que no ocurrió.

---

## 3. Mejoras de rendimiento

| Cambio | Impacto |
|---|---|
| `recharts` fuera del bundle inicial de `/admin` y `/admin/analytics/bias` | ~200 KB comprimido. El panel evaluaba la librería de gráficas antes de pintar las tarjetas de métricas, que no son gráficas |
| `@react-pdf/renderer` con `dynamic({ ssr: false })` en `ScorecardPDF` | ~300 KB, solo al pulsar «exportar» |
| `@react-pdf/renderer` dividido en `ProfileCVExport` | ~300 KB **en una página pública con SEO**: cada visita a un perfil enviaba un generador de PDF |
| `@clerk/nextjs` eliminado | 9 paquetes menos y un proveedor menos en el árbol de React de cada página |
| Análisis de sentimiento retirado de `/api/chat` | Una llamada al modelo menos **por turno** |
| `request.signal` propagado | Deja de pagarse la llamada cuando el candidato se va |
| `LandingClient.tsx` dividido en 11 módulos | Permite dividir el código por sección; hoy el beneficio es de mantenimiento |

Nota honesta: las cifras de las librerías son sus tamaños publicados, no una medición
propia. No se ejecutó un análisis de bundle antes y después; el efecto —que dejan de
estar en el grafo de la primera carga— sí es verificable en la salida de `next build`.

---

## 4. Refactorizaciones de arquitectura

### Lo que se extrajo

`/api/chat` tenía **939 líneas en un solo `try`**, con la autorización, el conteo de
preguntas, la construcción del prompt, la telemetría, dos llamadas a OpenRouter y el
manejo de errores entrelazados. Nada se podía leer ni probar por separado.

| Módulo nuevo | Qué encapsula |
|---|---|
| `lib/interview/zara-prompt.ts` (767) | Construcción del prompt. Funciones **puras** |
| `lib/interview/telemetry.ts` (226) | Registro de turnos y redacción de datos personales |
| `lib/api/openrouter.ts` | Cliente tipado: timeout, `signal`, extracción de JSON |
| `lib/api/errors.ts` | `ApiError` + `handleApiError` |
| `lib/api/auth.ts` | Sesión y pertenencia a organización |
| `lib/api/rate-limit.ts` | Limitador con respaldo en memoria |
| `lib/api/outbound-url.ts` | Guardia anti-SSRF |
| `lib/api/interview-access.ts` | Adaptador de la prueba de acceso existente |
| `lib/api/email.ts` | `escapeHtml` y `assertSelfHostedLink` |
| `lib/api/recruiter-notification.ts` | Aviso al reclutador, sin salto HTTP |
| `lib/schemas/` | Esquemas Zod con topes |
| `components/landing/` (11) | Las secciones de la portada |
| `components/shared/SectionError.tsx` | Cuerpo de los error boundaries |
| `app/actions/billing.ts` | Facturación leída en servidor |
| `hooks/useMediaStream.ts` | Cámara y micrófono, con liberación garantizada |
| `hooks/useMediaRecorder.ts` | Grabación; `stop()` devuelve el blob en una promesa |
| `hooks/useTTS.ts` | Voz de Zara: cancelación, URL de objeto, respaldo nativo |
| `hooks/useSTT.ts` | Transcripción con idioma real y vigilante de reinicio |
| `hooks/useSupabaseRealtime.ts` | Suscripción con canal único y manejador estable |
| `hooks/useModalDialog.ts` | Trampa de foco, Escape y devolución del foco |
| `lib/services/interview.service.ts` | Acceso a datos de la entrevista |
| `lib/services/evaluation.service.ts` | Puntuación ponderada, en funciones puras |
| `lib/interview/machine.ts` | Máquina de estados de la entrevista, reductor puro |
| `hooks/useDisclosure.ts` | Desplegable anclado: `aria-expanded`, Escape, clic fuera |
| `components/ui/Avatar.tsx` | Avatares con optimización condicionada y `alt` coherente |
| `app/actions/webhook-config.ts` | Configuración de webhook sin exponer el secreto |
| `__tests__/helpers/query-spy.ts` | Espía de consultas, para afirmar sobre la CONSULTA |
| `lib/coach/integration-secrets.ts` | Redacción y recomposición de credenciales |
| `app/actions/coach-settings-secure.ts` | Lectura y escritura sin exponer secretos |

`/api/chat` queda en 297 líneas de orquestación legible.

### El texto del prompt no se tocó

Todas las cadenas son literalmente las anteriores. El prompt de una entrevistadora es
comportamiento de producto calibrado: los comentarios `Bug N fix` son correcciones
reales del pasado, y reescribir el texto «para que quede mejor» las tiraría. Dos
pruebas fijan que las reglas duras (`RULE 3 — QUESTION COUNTER`, `RULE 4 — NEVER REPEAT
QUESTIONS`) siguen llegando al modelo.

### Lo que se reutilizó en vez de reescribir

La autorización de las rutas de IA **no** es nueva: `requireInterviewAccess` adapta
`src/lib/candidate-results/access-proof.ts`, que ya estaba escrito y probado. Mantener
una sola definición de «quién puede actuar sobre esta entrevista» es el punto: un
cuarto flujo de entrada se añade allí y las rutas lo heredan.

### Lo que se simplificó

- Identificadores de modelo centralizados en `lib/ai-model.ts`. `'x-ai/grok-4.20'`
  aparecía **seis veces solo en `chat/route.ts`**: una en la petición y cinco en las
  llamadas de telemetría. Acertar en cinco de seis produce telemetría que miente sobre
  qué modelo generó cada turno.
- `LandingClient.tsx` de 1068 líneas a un barril de 42.
- Un solo punto de entrada a `recharts`.
- Ocho manejos de error distintos unificados en `handleApiError`.

### ESLint sobre todo el código

Se retiraron las 22 rutas ignoradas. Aparecieron 42 errores, **todos corregidos**. Tres
reglas del compilador de React quedan como aviso, documentado en la configuración:
los 19 casos restantes están en componentes de 600–2100 líneas y corregirlos exige
reestructurarlos, que es refactor con riesgo real, no un arreglo de lint. Un aviso es
visible; ignorar el directorio hacía invisibles también los errores de verdad.

---

## 5. Tests agregados

De **798 en 52 archivos** a **905 en 57**. 107 pruebas nuevas sobre código que no
tenía ninguna.

> La línea base es 798, no 800: la comprobó una revisión independiente al final. Las
> dos de diferencia son pruebas que añadí al reescribir `chat-telemetry.test.ts`.

| Archivo | Qué fija |
|---|---|
| `__tests__/middleware.test.ts` (33) | Los 8 prefijos protegidos redirigen a `/login` con `redirectTo`; las rutas de candidato sin cuenta **no** se bloquean; aislamiento por rol; onboarding incluido el caso de bucle; destino tras iniciar sesión; el webhook de Stripe se salta la auth |
| `__tests__/api/chat-authorization.test.ts` (15) | Las 4 puertas de `/api/chat`. La aserción que importa en las tres primeras: **OpenRouter no se llama**. El tope se consume **después** de autorizar, para que un anónimo no agote la cuota de un candidato concreto. Las reglas duras del prompt llegan al modelo |
| `__tests__/api/rate-limit.test.ts` (10) | Cuenta y corta; `Retry-After` coherente; contadores aislados por identificador y por endpoint; el identificador es un hash y **no contiene la IP**; degradación al contador en memoria con un solo aviso |
| `__tests__/api/outbound-url.test.ts` (22) | Los 4 caminos de evasión de SSRF: literal en rango no enrutable, dominio público que resuelve a loopback o a metadatos, puerto y esquema, nombres reservados. Y que el mensaje **no** dice el motivo |
| `__tests__/api/schemas.test.ts` (25) | Cuerpo mínimo con los defectos anteriores; `POST {}` es 400 y no 500; topes de historial, mensaje, descripción y CV; `filename` ya no se acepta; lista blanca de vídeo; campos desconocidos descartados |
| `__tests__/api/chat-telemetry.test.ts` (reescrito) | Sin respaldo a la clave anon; sin clave de servicio no se registra y **no lanza**; un aviso por proceso; el resumen no contiene datos personales |
| `__tests__/hooks/media.test.tsx` (20) | La aserción central es `track.stop()` tras `unmount()`, en tres formas: desmontaje directo, desmontaje sin llamar a `stop()`, y cambio de dispositivo a mitad. Negociación del tipo MIME y vaciado de los fragmentos |
| `__tests__/hooks/voice.test.tsx` (18) | Las dos carreras reales de la sala: que `speak()` cancele la locución anterior y descarte una respuesta tardía, y que el reconocimiento se reinicie solo si se sigue queriendo escuchar. Y que `useSTT` use `es-ES` |
| `__tests__/hooks/modal-dialog.test.tsx` (10) | Las cuatro propiedades de teclado que faltaban en los seis modales, una por fallo de uso concreto |
| `__tests__/coach-integration-secrets.test.ts` (12) | Que ningún fragmento de credencial sobreviva a la serialización, y que guardar sin tocar nada **no** destruya la integración |
| `__tests__/services/evaluation.test.ts` (16) | Los umbrales EN el límite; que un peso alto pese más; criterio sin puntuación como 0; peso 0 fuera del divisor; y que `applyWeightedScore` no mute su entrada |

Dos defectos reales aparecieron **al escribir las pruebas** (2.18 y el `looseObject` de
la sección siguiente), que es la mejor señal de que las pruebas valían la pena.

### Un error propio que las pruebas encontraron

Los esquemas usaban `z.looseObject`, que en Zod 4 **propaga** las claves no declaradas
—lo contrario de lo que afirmaba mi comentario—. Un campo arbitrario del cuerpo
sobrevivía a la validación y llegaba al manejador. Corregido a `z.object`, que las
descarta. Los esquemas anidados de contenido generado por modelo siguen laxos a
propósito.

---

## 6. Deuda técnica restante

### 6.1 `/api/tts` y `/api/parse-resume` sin autenticación — decisión consciente

Ambas atienden a personas **sin cuenta** en el flujo principal: `InterviewRoom` en los
caminos de ticket y enlace público, `useAiVoice` en las sesiones informativas para
posibles clientes, y `DetailsForm` antes de entrar a la sala. Exigir sesión dejaría
muda la entrevista y sin subir el CV.

Y no hay recurso que proteger: no leen ni escriben en la base, no reciben
identificadores y devuelven al llamante lo que él mismo envió. El único riesgo es el
coste, y el control correcto para el coste es el tope de tasa más el tope de longitud,
que es lo que se aplicó.

**Pendiente:** `/api/tts` podría exigir la credencial de entrevista en el camino de
`InterviewRoom` y dejarla opcional en el del asesor virtual. Es un control más, no un
agujero abierto.

### 6.2 La rúbrica viaja al cliente en los flujos con credencial

`/api/public-interview` y `/api/interview/ticket` devuelven `topics` con `rubric`
completa: pesos y descriptores `excellent`/`acceptable`/`poor`. El candidato recibe la
plantilla con la que se le va a calificar.

**No se cambió**, y es deliberado. El repositorio ya razonó este caso en
`src/lib/jobs/public-projection.ts`: esas rutas exigen credencial, a diferencia del
portal público, y el cliente la necesita —`/api/chat` recibe `allTopics` con `rubric`
y `/api/evaluate` recalcula la puntuación ponderada con esos pesos—. Recortarla ahora
dejaría todas las puntuaciones con peso 5, es decir, rompería la evaluación.

**Corrección de fondo:** que `/api/chat` y `/api/evaluate` lean la rúbrica de `roles`
con el `roleId` que ya reciben. Elimina además la inyección de rúbrica en el prompt. Es
un cambio del núcleo de la entrevista y necesita su propia ronda con pruebas del flujo
completo.

### 6.3 Siete tablas en producción sin migración en el repositorio

**Cerrada.** Se obtuvo acceso de solo consulta al proyecto de Supabase de producción vía MCP y
se verificó el esquema real contra el del repositorio.

El diagnóstico original era incorrecto en un punto importante: `courses`, `coach_settings`,
`coach_notifications`, `course_modules`, `course_plans` e `info_sessions` **sí existían** en
producción, con RLS activo y con políticas correctas (`org_members_manage_*` para el CRUD del
asesor, `public_read_active_*` para el catálogo público). Se habían creado por una vía distinta
al repositorio —probablemente SQL ejecutado directamente en algún momento anterior a este
trabajo— así que el historial de migraciones de Supabase no las registraba con el nombre del
archivo correspondiente, y una comparación por nombre de migración las marcaba como ausentes. Una
comparación por columna real corrigió el diagnóstico.

Lo que sí faltaba de verdad, confirmado por ausencia real de la tabla en
`information_schema.tables`, era el módulo social completo:

| Tabla | Contenido |
|---|---|
| `notifications` | Avisos del feed (conexión, reacción, comentario, seguidor) |
| `endorsements` | Aprobación de habilidades entre perfiles |
| `saved_jobs` / `job_applications` | Vacantes guardadas y seguimiento de aplicaciones |
| `follows` | Seguimiento unidireccional entre perfiles |
| `hashtags` / `post_hashtags` | Etiquetas del feed |
| `groups` / `group_members` / `group_posts` | Comunidades |
| `user_blocks` / `reports` / `poll_votes` | Bloqueo, reportes, encuestas en publicaciones |
| `api_rate_limits` | Contador de `consume_rate_limit`, ver 2.9 del round original |

**Se crearon las 14, con dos correcciones respecto al SQL original del repositorio:**

- `hashtags`/`post_hashtags` se crearon **sin** las políticas de escritura abiertas que
  `20260513_hashtags.sql` tenía (`hashtags_insert`/`hashtags_update`/`post_hashtags_insert` con
  `WITH CHECK (true)`, ver 2.39). Solo lectura para clientes; la escritura la hace el disparador
  `SECURITY DEFINER`.
- `notifications` se creó **sin** `notif_insert`, que en el archivo original no llevaba `TO`, así
  que aplicaba a `anon` (ver el hallazgo equivalente ya corregido en el archivo del repo).

Un efecto colateral que no estaba previsto: las seis funciones `SECURITY DEFINER` nuevas (los
disparadores de notificación, hashtags y contadores) quedaron ejecutables directamente vía
`/rest/v1/rpc/<nombre>` por `anon` y `authenticated` — el linter de seguridad de Supabase lo
marcó como `WARN` inmediatamente después de crearlas. Ninguna se invoca por RPC desde el código
(se disparan solo como efecto de un `INSERT`/`UPDATE`), así que se revocó `EXECUTE` de las seis.
Sin esa revocación, cualquier cuenta podría haber llamado `notify_post_reaction()` directamente
con argumentos arbitrarios, insertando notificaciones falsas sin pasar por la tabla que las
dispara de verdad.

También se cerró en producción la vulnerabilidad de `interview_telemetry` documentada en 2.31: la
política `USING (true)` para `authenticated` seguía activa a pesar de que la migración
`202608020002` del repositorio la elimina — nunca se había desplegado. Se confirmó en vivo: 624
filas de 55 candidatos distintos expuestas antes de la corrección.

Estado final verificado con `get_advisors(security)`: cero hallazgos nuevos introducidos por este
trabajo. Los tres que quedan (`organizations` INSERT abierto, `is_training_admin` expuesto,
protección de contraseñas filtradas desactivada) son preexistentes y ya estaban documentados en
2.7 y en este mismo reporte antes de esta sesión.

### 6.4 `'unsafe-inline'` en `script-src`

Next inyecta los datos de hidratación en `<script>` en línea. Quitarlo exige un nonce
por petición, y el nonce cambia en cada respuesta, así que **toda** página pasa a
dinámica: ninguna puede servirse estática ni desde caché de CDN. Las rutas públicas de
este proyecto (landing, portal de empleo, empresa, perfil) dependen de esa caché.
Convertirlas en dinámicas cambia el perfil de rendimiento del producto entero, y esa
decisión no es de una ronda de seguridad.

### 6.5 Ventana de DNS rebinding en la guardia anti-SSRF

Entre la validación y el `fetch`, el registro puede cambiar de dirección. Cerrarla
exige fijar la IP validada al abrir el socket (un `Agent` con `lookup` propio), lo que
obliga a gestionar el pool de conexiones a mano y perder el `fetch` nativo.

Se acepta porque el resto quita el valor al ataque: ambas rutas exigen sesión de
`owner`/`admin`, no devuelven el cuerpo del destino y el `fetch` tiene tope de 10 s.

### 6.6 Componentes que siguen siendo demasiado grandes

| Archivo | Líneas |
|---|---|
| `admin/training/configure/[programId]/page.tsx` | ~2 170 |
| `components/candidate/InterviewRoom.tsx` | ~2 210 |
| `admin/create-role/page.tsx` | 1 817 |
| `coach/create-course/page.tsx` | 1 231 |
| `coach/settings/page.tsx` | 1 130 |

Son también donde viven los avisos restantes de las reglas del compilador de React.

**Lo que sí se hizo en `InterviewRoom`:** la máquina de estados (ver 2.26, 2.27 y 2.28) y las
fugas de recursos (2.19, 2.20). El componente sigue teniendo 2 200 líneas, pero ya no tiene
estados imposibles ni deja la cámara encendida, que era el riesgo real; el tamaño es
mantenibilidad.

**Lo que queda:** partirlo. El orden correcto es primero pruebas de integración del flujo
completo, y esas necesitan un navegador de verdad —cámara, micrófono, reconocimiento de voz—,
es decir Playwright, que este proyecto no tiene configurado. Montarlo es un trabajo con su
propio alcance.

### 6.7 Los hooks de medios y voz aún no se usan dentro de `InterviewRoom`

**Las fugas de recursos están corregidas** (2.19, 2.20, 2.21) y **la máquina de estados está
conectada** (2.26). Lo que queda es que `InterviewRoom` siga gestionando TTS, reconocimiento
de voz y grabación con sus propios refs en lugar de con `useTTS`, `useSTT`, `useMediaStream` y
`useMediaRecorder`, que existen y tienen 38 pruebas.

Sustituirlos es el mismo trabajo que 6.6 —reestructurar el componente— así que va con él.

Los hooks se escribieron primero a propósito: son la parte que se puede probar en aislamiento,
y tener pruebas verdes sobre el comportamiento correcto es lo que hará seguro el reemplazo.
Uno de ellos, `useSTT`, ya aporta valor sin estar conectado: corrigió el idioma fijo de
`src/lib/stt.ts`, que sí se usa en el módulo de informes.

### 6.8 Fetch en cliente que debería ser Server Component

`/admin` completo, `AdminSidebarNav` y `create-role` (que consultan `plan_tier` **dos
veces**, la misma información), `/admin/group-interview`, `/informes`. Afecta al LCP
del panel. Es refactor de páginas, no de seguridad.

### 6.9 Accesibilidad: hecho lo estructural, quedan las imágenes

**Resuelto:** los cuatro modales (`HireModal`, `CompareModal`, `ReportModal`,
`JobDetailModal`) con `role="dialog"`, `aria-modal`, trampa de foco, Escape y devolución del
foco; los dos desplegables (menú móvil y panel de notificaciones) con `aria-expanded`,
`aria-controls`, Escape y clic fuera; la sala de entrevista anunciando sus estados con
`role="status"` y `aria-live="polite"`; `prefers-reduced-motion` en las animaciones CSS,
incluidas las de bucle infinito del orbe de Zara; y los quince avatares con `alt` coherente y
respaldo de iniciales.

**Queda:** 19 de los 26 `<img>` originales. Los siete de avatar están hechos vía el
componente `Avatar`; los 19 restantes son logotipos de empresa, vistas previa de medios, la
foto del testimonio y el vídeo de la portada. Cada grupo necesita una decisión distinta
—dimensiones conocidas, `sizes` correcto, `priority` solo en el que está sobre el pliegue— y
convertirlos en bloque sin esa decisión produce peor rendimiento, no mejor.

También queda el vídeo `hero.mp4` (1,5 MB) sin `poster` ni `preload`, que provoca un salto de
diseño visible al cargar la portada.

### 6.10 `LazyMotion` no aplicado

`framer-motion` se importa en 29 archivos. El beneficio real de `LazyMotion` exige
migrar `motion.*` a `m.*` en los 29, porque sin `strict` la envoltura no reduce nada. Es
mecánico pero toca todas las animaciones del producto, y el ahorro (~30 KB) no
justifica ese radio en la misma ronda que los cambios de seguridad.

### 6.11 Stores Zustand sin selectores

**Resuelto:** `coachSettingsStore` (1.18) y `webhookStore` ya no traen secretos al navegador. Y
`adminStore` dejó de perder entradas de su cola de reintento (2.32) y de dejar la pantalla
divergente de la base cuando una escritura falla (2.33).

**Queda:** ningún store expone selectores granulares, así que los componentes se
re-renderizan con cualquier cambio del store. Y cinco siguen consultando Supabase
directamente desde el navegador (`adminStore`, `ticketStore`, `coachStore`,
`trainingAdminStore`, `infoSessionStore`). Ninguno de los cinco maneja secretos: lo que
mueven son datos que su propia organización puede leer, así que es un asunto de arquitectura
y de rendimiento, no de exposición.

`adminStore` es el de mayor peso: 682 líneas con cola de reintento en `localStorage`, mapeos
y detección de organización. Debería delegar en un servicio.

**Cobertura de stores, actualizada.** `adminStore` ya tenía pruebas de la cola de reintento y de
la reversión de escrituras optimistas de roles. Se añadieron `coachSettingsStore` (17 pruebas:
`isDirty` se limpia en `fetchSettings` y en un `saveSettings` con éxito, y NO se limpia cuando
cualquiera de los dos falla; `partialize` no incluye `isDirty` ni ningún secreto de
integraciones, solo `notificationSound`; las cuatro acciones de equipo con Supabase directo),
`ticketStore` (9 pruebas: `syncAddTicket` devuelve un resultado con motivo para los tres fallos
posibles —sin sesión, sin organización, escritura fallida— y ya no depende de `NODE_ENV` para
avisar) y `trainingStore` (12 pruebas: la reversión de `sendGeneralMessage`/`sendModuleMessage`
ante un fallo de red, aislada por módulo cuando corresponde, y la validación de forma de
`incrementTimeSpent`). Las tres suites se verificaron revirtiendo manualmente el comportamiento
que cada prueba afirma y confirmando que fallan.

### 6.12 Cobertura: el 70 % en `actions/` no se alcanzó

**Estado real, medido con `npm run test:coverage`:**

| Ruta | Cobertura de sentencias |
|---|---|
| `src/lib/coach/` | **100 %** |
| `src/lib/schemas/` | ~95 % |
| `src/lib/interview/` | **70 %** |
| `src/lib/api/` | **53 %** |
| `src/lib/services/` | **41 %** |
| `src/app/actions/` | **17,2 %** (era 2,89 %) |

Dentro de `actions/`, los archivos que se corrigieron por seguridad sí están cubiertos:
`billing` 86 %, `coach-settings-secure` 80 %, `jobs` 67 %, `company` 66 %, `search` 54 %.

**Por qué no se alcanzó el 70 % del directorio completo, y por qué no se forzó:** los doce
archivos sin cubrir son más de 2 500 líneas de `feed`, `profile`, `onboarding`,
`organizations` y `coach-settings`, casi todas lectores y escrituras cuyo riesgo principal
era la autorización — y esa se corrigió **en el código**, con comprobaciones explícitas en
lugar de confiar en RLS. Escribir 2 500 líneas de prueba para subir un número, en lugar de
cubrir el middleware, el tope de tasa, la guardia anti-SSRF, el ciclo de vida de cámara y
micrófono y la puntuación del candidato, habría sido optimizar la métrica en vez del riesgo.

Lo que sí se hizo para que no retroceda: `vitest.config.ts` fija **umbrales por ruta**, no
uno global. Un umbral global tendría que estar en el 30 % para pasar, y el 30 % no protege
nada porque cabe dentro cualquier módulo nuevo sin una sola prueba. Los umbrales por ruta se
sitúan justo por debajo de lo que cada módulo tiene hoy, así que una regresión en un módulo
cubierto falla aunque el número global suba.

Sin cobertura: `/api/tts`, `/api/send-email`, `/api/upload-video`, `/api/test-integration`,
los stores e `InterviewRoom`.

### 6.13 No hay pruebas de extremo a extremo

Es la carencia que bloquea 6.6 y 6.7. El flujo de entrevista necesita un navegador real
—permisos de cámara y micrófono, reconocimiento de voz, reproducción de audio— y este
proyecto no tiene Playwright ni equivalente configurado.

Hasta que exista, la máquina de estados (42 pruebas) y los hooks (38) son la mejor garantía
disponible: cubren las decisiones y el ciclo de vida en aislamiento, que es donde estaban los
fallos. Lo que no cubren es la integración de las piezas, y eso es exactamente lo que impide
recomendar la reescritura de `InterviewRoom` en esta ronda.

---

### 6.14 La exportación de PDF y transcripción no respeta el plan

`src/lib/stripe/index.ts` declara `transcriptExport: false` para el plan `starter`, y
`admin/report/[id]` extrae `planTier` del store —evidencia de que alguien pensó en limitarlo— pero
nunca lo usa. Hoy cualquier plan exporta.

**No se ha implementado la restricción, y la razón es que un tope en el cliente aquí no serviría de
nada.** El informe se pinta con datos que ya están en el navegador: la generación del PDF y la
descarga de la transcripción son locales. Esconder el botón lo esconde de quien no abre las
herramientas de desarrollo, y nada más.

Una restricción real exige mover el informe a servidor y generar el PDF allí, comprobando el plan
antes de responder. Es un cambio de arquitectura, no una condición en un `render`. Se documenta como
decisión de producto en lugar de dejar un tope que aparente proteger.

### 6.15 Claves ajenas sin `ON DELETE`: resuelto

**Resuelto: claves foráneas sin `ON DELETE`.** Con acceso real al proyecto de Supabase se
verificaron las 61 claves foráneas del esquema con `pg_constraint` (no por nombre de migración,
que ya había dado un diagnóstico incompleto en 6.3). Diez tenían `NO ACTION` — nueve columnas
distintas, ya que `user_profiles` tenía dos—, no siete: `roles.org_id`, `candidates.org_id`,
`candidates.role_id`, `interviews.org_id`, `interviews.candidate_id`, `user_profiles.org_id`,
`user_profiles.user_id`, `job_applications.org_id`, `team_invitations.invited_by` y
`groups.creator_id`.

Se declaró explícitamente una acción en cada una (migración `202608040002`), sin dejar ninguna en
`NO ACTION`:

 - **`RESTRICT` en las cinco que apuntan a `organizations`** (`roles`, `candidates`, `interviews`,
   `user_profiles`, `job_applications`). Se consideró `CASCADE` y se descartó: `organizations` es
   la raíz del tenant, y un `CASCADE` ahí borra en cadena todos los roles, candidatos, entrevistas
   y perfiles de una empresa sin ninguna confirmación intermedia. Se comprobó que hoy no existe
   ninguna función que borre una organización con datos reales — los tres
   `.from('organizations').delete()` del repositorio son rollback de una organización recién
   creada en la misma petición, antes de que exista una fila dependiente—, así que `RESTRICT` no
   cambia ningún comportamiento actual.
 - **`RESTRICT` en `candidates.role_id` e `interviews.candidate_id`**: mismo criterio que ya
   tenían `training_documents.role_id` y `training_employees.role_id` en el esquema existente. Un
   candidato y su entrevista son historial de contratación, no un dato desechable al borrar la
   vacante.
 - **`RESTRICT` en `user_profiles.user_id`**, distinto del resto de tablas que apuntan a
   `auth.users` (que usan `CASCADE` porque son contenido social del propio usuario).
   `user_profiles` es el enrutamiento organización↔persona: permitir `CASCADE` haría que borrar
   una cuenta de Supabase Auth borrara en silencio su membresía de organización sin que ningún
   flujo de la aplicación lo decidiera.
 - **`SET NULL` en `team_invitations.invited_by`**: es la única de las diez donde bloquear el
   borrado sería el error. Si quien invitó borra su cuenta, la invitación pendiente no debe
   impedirlo. La columna ya admitía `NULL`.
 - **`RESTRICT` en `groups.creator_id`**, no `SET NULL`: la columna es `NOT NULL` en la definición
   de la tabla, y relajar esa restricción es un cambio de otro alcance —afecta a qué puede mostrar
   la interfaz de un grupo sin creador—, así que se deja fuera de esta migración. Queda como deuda
   en 6.17.

El único borrador de `roles` en todo el código (`removeRole` en `adminStore.ts`) recibió un
mensaje específico para cuando el borrado choca con la nueva restricción: antes de este cambio,
un puesto con candidatos habría mostrado el mismo aviso genérico que cualquier otro fallo de
sincronización, sin explicar que hay que cerrarlo en vez de borrarlo. Se distingue por el código
Postgres `23503` (violación de clave foránea). 3 pruebas nuevas, verificadas contra una reversión
manual del cambio.

### 6.17 Pendiente: `groups.creator_id` sigue en `RESTRICT`, no en `SET NULL`

Documentado como decisión deliberada en 6.15. Para pasar a `SET NULL` haría falta primero relajar
`creator_id` a nullable, y eso cambia lo que la interfaz de un grupo puede mostrar cuando no hay
creador (hoy ese caso es literalmente irrepresentable). Es un cambio de producto, no solo de
esquema, y el módulo de grupos tiene cero filas en producción — no hay urgencia real.

### 6.18 Tipos de fecha incoherentes: sigue pendiente

`interview_tickets.created_at`/`expires_at` y `candidate_results.date` son `BIGINT` con epoch en
milisegundos mientras el resto del esquema usa `TIMESTAMPTZ`. Se confirmó con acceso real al
proyecto que los dos lados son coherentes consigo mismos —no hay desajuste de unidades entre lo
que el código escribe y lo que la columna espera—, pero obliga a conversiones distintas según la
tabla.

No se ha tocado: migrar el tipo de una columna con datos (95 tickets, 103 resultados de candidato
reales) es una operación que reescribe la tabla entera, y a diferencia de una acción de clave
foránea —que es un cambio de metadatos reversible en el acto— una migración de tipo mal medida sí
puede perder precisión o fallar a mitad. Se prioriza correctamente por debajo de las claves
foráneas, que eran el riesgo de integridad más alto y ya están resueltas.

### 6.19 El aviso de cambios sin guardar no cubre la navegación interna

`useUnsavedChangesWarning` se apoya en `beforeunload`, que cubre recargar, cerrar la pestaña y salir
del sitio. **No** cubre pulsar un enlace del panel, porque el App Router lo resuelve en el cliente
sin descargar el documento y no hay punto de intercepción estable para eso en Next 16.

Cubrirlo exigiría envolver cada enlace o vigilar el historial, y las dos cosas se rompen con cada
cambio del enrutador. Queda documentado en el propio hook para que nadie dé por hecho que protege
más de lo que protege.

---

## 7. Métricas

| | |
|---|---|
| Commits | 50, atómicos |
| Archivos cambiados | 150 (68 nuevos, 80 modificados, 2 eliminados) |
| Líneas | +19 127 / −4 093 |
| Migraciones nuevas | 2 |
| Rutas API endurecidas | 15 |
| Vulnerabilidades corregidas | 18 (9 críticas, 7 altas, 2 medias) |
| Bugs funcionales corregidos | 40 |
| Pruebas | 798 → **1 209** (+411); 52 → 75 archivos |
| Errores de ESLint | 42 → **0**, sobre todo `src/` (antes 22 rutas ignoradas). Avisos: 101 → 92 |
| `any` explícitos en `src/` | 42 → 12 (los restantes, en pruebas) |
| `console.log` de depuración | 29 → 0 en rutas API |
| `/api/chat` | 939 → 297 líneas |
| `LandingClient.tsx` | 1068 → 42 líneas (+ 11 módulos) |
| Error boundaries | 1 → 8 |
| Hooks reutilizables nuevos | 7 (medios, voz, realtime, diálogo, desplegable) |
| Modales con teclado accesible | 0 → 4 · Desplegables accesibles | 0 → 2 |
| `<img>` nativos | 26 → 19 |

**Trabajo directo en el proyecto de Supabase de producción** (con acceso real vía MCP, separado
de las cifras de código de arriba): 1 vulnerabilidad crítica cerrada en vivo (`interview_telemetry`,
624 filas de 55 candidatos expuestas), 14 tablas nuevas creadas (módulo social completo, 36 → 50
tablas), 10 acciones `ON DELETE` declaradas explícitamente donde no había ninguna, 7 avisos de
seguridad del propio linter de Supabase corregidos tras crearlos (funciones `SECURITY DEFINER`
expuestas por RPC). Verificado en cada paso con `get_advisors` antes/después, no solo con la
suite de pruebas local.
| Cobertura de `src/app/actions` | 2,89 % → **17,21 %** |
| Variables en `.env.example` | 14 → 34 |
| Dependencias | −1 (`@clerk/nextjs`), +1 (`server-only`, antes transitiva) |

### Verificación

```
npm run typecheck        →  0 errores
npm run lint             →  0 errores, 92 avisos (documentados)
npm run test:run         →  1 167 pruebas, 72 archivos, todas en verde
npm run check:endpoints  →  toda ruta declara un control
npm run build            →  compilación correcta, 69 páginas
```

`npm run verify` ejecuta los cuatro primeros de una pasada.

### Revisión independiente

El resultado se sometió a una revisión de seguridad independiente, sin compartirle el
contexto de la implementación, con el encargo explícito de **desmentir** las
afirmaciones del informe y de buscar regresiones en los flujos del candidato.

Conclusión de la primera revisión (rutas y RLS): ninguna regresión; los tres caminos de
entrada establecen la prueba de acceso antes de que las rutas la necesiten; ninguna afirmación
falsa. Corrigió dos cifras mías —la línea base de pruebas era 798 y no 800, y los avisos de
lint eran 101 y no 99—.

Una **segunda revisión independiente** del cambio de mayor riesgo —el conectado de la máquina
de estados a `InterviewRoom`— encontró una **regresión crítica** y tres fallos más. Están
documentados en 2.29. Esa revisión es la razón de que la regresión no llegara a producción, y
la conclusión operativa es que el paso de revisión externa sobre el componente crítico no es
opcional: mis 42 pruebas de la máquina estaban en verde con el fallo dentro.

### Antes de desplegar

1. **Aplicar las dos migraciones.** `202608020002` cierra las fugas de RLS;
   `202608020001` habilita el limitador global. Sin la segunda, el limitador funciona
   degradado (por instancia) pero sin romper nada.
2. **Rotar las claves de Stripe** si el proyecto estuvo en producción con
   `public_company_select` abierta: los identificadores de cliente y suscripción de
   toda la cartera fueron legibles con la clave anon.
3. **Comprobar los flujos de candidato** en un entorno de prueba: los tres caminos de
   entrada ahora envían credenciales que antes no enviaban.
4. **Revisar los avisos de ESLint** (92). Ninguno bloquea, y son la lista de trabajo
   de 6.6 y 6.9.
