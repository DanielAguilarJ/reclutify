# Reporte de auditoría y refactorización — Reclutify

**Base:** `8c92f6e` · **Rama:** `refactor/security-audit-hardening` · **21 commits**

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

### 2.19 Actualización silenciosa de cero filas

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

`courses`, `coach_settings`, `coach_notifications`, `course_modules`, `course_plans`,
`info_sessions` e `info_session_telemetry` se usan extensamente en el código pero
**ninguna migración las crea**. Un despliegue limpio desde el repositorio no las crea,
así que el módulo de informes y del asesor está roto en un entorno nuevo. Y sus
políticas RLS son desconocidas: no se puede afirmar que existan.

Es la deuda de mayor riesgo que queda. Requiere volcar el esquema real de producción y
versionarlo, que exige acceso al proyecto de Supabase.

**Mitigación aplicada:** las tres funciones de `courses` que no comprobaban nada ahora
lo hacen en el código, así que no dependen de RLS.

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
| `admin/training/configure/[programId]/page.tsx` | 2 158 |
| `components/candidate/InterviewRoom.tsx` | 2 190 |
| `admin/create-role/page.tsx` | 1 817 |
| `coach/create-course/page.tsx` | 1 231 |
| `coach/settings/page.tsx` | 1 130 |

Son también donde viven los 19 avisos de las reglas del compilador de React.

**`InterviewRoom` en particular:** el hook `useZaraInterview` con máquina de estados
**no** se implementó. El diseño está listo —un `type` discriminado de siete estados
mutuamente excluyentes que sustituye 6 booleanos de estado y 8 refs booleanas, con los
efectos de TTS, STT, temporizador, `MediaRecorder`, `AudioContext` y llamada al modelo
encapsulados y con cleanup— y el motivo de no hacerlo es honesto: es la reescritura del
componente crítico del producto, con condiciones de carrera reales entre TTS, STT y
chat, y sin pruebas de integración del flujo completo que respalden el cambio. El orden
correcto es primero esas pruebas, después la máquina de estados.

Se corrigió lo que sí era acotable en el archivo: los `any` de `SpeechRecognition`, y
el envío de credenciales.

### 6.7 Fugas de recursos en `InterviewRoom` sin corregir

El cleanup del `useEffect` general no detiene `streamRef` (las pistas de cámara y
micrófono) ni `mediaRecorderRef`: solo lo hace `endInterview()`. Si el componente se
desmonta por navegación sin pasar por ahí, las pistas quedan activas y el LED de la
cámara encendido. `startInterview` tampoco limpia un `timerRef` previo antes de crear
otro.

Van con 6.6: tocar el ciclo de vida de ese componente sin la máquina de estados y sin
pruebas es cambiar una fuga por una condición de carrera.

### 6.8 Fetch en cliente que debería ser Server Component

`/admin` completo, `AdminSidebarNav` y `create-role` (que consultan `plan_tier` **dos
veces**, la misma información), `/admin/group-interview`, `/informes`. Afecta al LCP
del panel. Es refactor de páginas, no de seguridad.

### 6.9 Accesibilidad

Seis modales sin `role="dialog"`, `aria-modal`, trampa de foco ni cierre con Escape
(`HireModal`, `CompareModal`, `ReportModal`, `JobDetailModal`, el menú móvil de la
landing, el panel de notificaciones). En la sala de entrevista, los cambios de estado
(«grabando», «procesando») no se anuncian por falta de `aria-live`. Los error
boundaries nuevos sí llevan `role="alert"`.

También quedan 26 `<img>` nativos —sin lazy loading ni formato moderno— y ausencia de
`prefers-reduced-motion` en las animaciones CSS de `globals.css`.

### 6.10 `LazyMotion` no aplicado

`framer-motion` se importa en 29 archivos. El beneficio real de `LazyMotion` exige
migrar `motion.*` a `m.*` en los 29, porque sin `strict` la envoltura no reduce nada. Es
mecánico pero toca todas las animaciones del producto, y el ahorro (~30 KB) no
justifica ese radio en la misma ronda que los cambios de seguridad.

### 6.11 Stores Zustand sin selectores y con acceso directo a Supabase

Ningún store expone selectores granulares, así que los componentes se re-renderizan con
cualquier cambio del store. Y siete stores consultan Supabase directamente desde el
navegador; el más preocupante es `coachSettingsStore`, que carga al cliente las claves
de API de HubSpot, Notion y Google Sheets de la organización. Con RLS correcto solo las
ve su propia organización, pero **la tabla `coach_settings` es una de las siete sin
migración** (6.3), así que no se puede afirmar. Debería leerse en servidor y no viajar
nunca al navegador.

### 6.12 Cobertura aún nula en varios módulos

`/api/evaluate`, `/api/tts`, `/api/send-email`, `/api/upload-video`,
`/api/test-integration`, casi todas las server actions, los stores e `InterviewRoom`.
El objetivo de 70 % en `actions/` no se alcanzó: se priorizó cubrir los controles de
seguridad nuevos y el middleware, que es donde un fallo concede acceso en silencio.

---

## 7. Métricas

| | |
|---|---|
| Commits | 21, atómicos |
| Archivos cambiados | 108 (44 nuevos, 62 modificados, 2 eliminados) |
| Líneas | +11 779 / −3 775 |
| Migraciones nuevas | 2 |
| Rutas API endurecidas | 15 |
| Vulnerabilidades corregidas | 17 (9 críticas, 6 altas, 2 medias) |
| Bugs funcionales corregidos | 19 |
| Pruebas | 798 → **905** (+107); 52 → 57 archivos |
| Errores de ESLint | 42 → **0**, sobre todo `src/` (antes 22 rutas ignoradas). Quedan 101 avisos |
| `any` explícitos en `src/` | 42 → 12 (los restantes, en pruebas) |
| `console.log` de depuración | 29 → 0 en rutas API |
| `/api/chat` | 939 → 297 líneas |
| `LandingClient.tsx` | 1068 → 42 líneas (+ 11 módulos) |
| Error boundaries | 1 → 8 |
| Variables en `.env.example` | 14 → 34 |
| Dependencias | −1 (`@clerk/nextjs`), +1 (`server-only`, antes transitiva) |

### Verificación

```
npm run typecheck        →  0 errores
npm run lint             →  0 errores, 101 avisos (documentados)
npm run test:run         →  905 pruebas, 57 archivos, todas en verde
npm run check:endpoints  →  toda ruta declara un control
npm run build            →  compilación correcta, 69 páginas
```

`npm run verify` ejecuta los cuatro primeros de una pasada.

### Revisión independiente

El resultado se sometió a una revisión de seguridad independiente, sin compartirle el
contexto de la implementación, con el encargo explícito de **desmentir** las
afirmaciones del informe y de buscar regresiones en los flujos del candidato.

Conclusión: ninguna regresión; los tres caminos de entrada establecen la prueba de
acceso antes de que las rutas la necesiten; ninguna afirmación falsa. Corrigió dos
cifras mías —la línea base de pruebas era 798 y no 800, y los avisos de lint son 101 y
no 99— y ambas están ya rectificadas arriba.

### Antes de desplegar

1. **Aplicar las dos migraciones.** `202608020002` cierra las fugas de RLS;
   `202608020001` habilita el limitador global. Sin la segunda, el limitador funciona
   degradado (por instancia) pero sin romper nada.
2. **Rotar las claves de Stripe** si el proyecto estuvo en producción con
   `public_company_select` abierta: los identificadores de cliente y suscripción de
   toda la cartera fueron legibles con la clave anon.
3. **Comprobar los flujos de candidato** en un entorno de prueba: los tres caminos de
   entrada ahora envían credenciales que antes no enviaban.
4. **Revisar los avisos de ESLint** (101). Ninguno bloquea, y son la lista de trabajo
   de 6.6 y 6.9.
