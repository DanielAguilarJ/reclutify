# CHANGELOG

## [Unreleased] — Auditoría de seguridad y refactorización

Informe completo con el detalle de cada hallazgo: [`REPORTE_REFACTOR.md`](REPORTE_REFACTOR.md).

Contexto: el proyecto ya había pasado por dos rondas de endurecimiento que cubrieron
el centro de capacitación y el flujo público de vacantes. Esta ronda cubre el núcleo
del negocio —la entrevista, la evaluación, el correo, el vídeo y las integraciones—,
que había quedado fuera.

### Seguridad

- **`/api/upload-video` firmaba escrituras arbitrarias en el bucket R2.** Hacía
  `const key = filename` sin sesión ni validación, así que una petición anónima
  obtenía permiso de escritura de 15 minutos sobre cualquier objeto: sobrescribir la
  grabación de otro candidato, o subir `text/html` a un bucket público. El servidor
  deriva ahora la clave del `orgId` que acredita la credencial.
- **Dos relés de correo abiertos cerrados.** `/api/send-email` y `/api/notifications`
  enviaban con la marca de la empresa a cualquier destinatario, con el enlace del
  botón elegido por el llamante y el HTML sin escapar. Ahora exigen sesión de
  organización; el enlace debe resolver al origen propio del despliegue.
- **Tres SSRF cerrados.** `/api/test-integration` y
  `/api/webhooks/candidate-completed` hacían `fetch` a una URL del cuerpo sin sesión y
  devolvían el estado del destino. `/api/evaluate` construía la URL de aviso con la
  cabecera `Origin`, exfiltrando nombre, puntuación y recomendación del candidato.
  Nueva guardia `assertSafeOutboundUrl` con resolución de DNS; el salto HTTP interno
  de `evaluate` se sustituye por una llamada en proceso.
- **Fuga de CV entre organizaciones cerrada.** `interview_telemetry` tenía
  `SELECT TO authenticated USING (true)` y guardaba el prompt completo con el CV del
  candidato. Cualquier cuenta —el registro es abierto— podía leer los CV y las
  transcripciones de todas las empresas clientes. La política se retira y el cuerpo de
  la petición deja de guardarse.
- **Inserción de notificaciones abierta a `anon` cerrada.** `notif_insert` tenía
  `WITH CHECK (true)` sin cláusula `TO`, así que cualquiera podía crear avisos
  falsos con enlace propio para un usuario concreto.
- **Estado de facturación de la cartera dejó de ser público.** `organizations` era
  legible por `anon` e incluía los identificadores de Stripe y el estado de
  suscripción de todos los clientes. `REVOKE` a nivel de columna; los tres lectores
  pasan al servidor.
- **Limitación de tasa, que no existía en ningún endpoint.** Ventana fija en Postgres
  con ocho topes por función, y respaldo en memoria si la RPC no está disponible.
- **Validación Zod** en trece rutas que no tenían ninguna, con topes de longitud en
  todo lo que se interpola en el prompt del modelo.
- **Inyección de filtro PostgREST** en la búsqueda de personas y vacantes: el término
  se interpolaba en `.or()`, que es gramática de filtros y no un valor parametrizado.
- **Escalada de plan** en `updateCompanyProfile`: pasaba el objeto recibido a
  `.update()`, así que `{ plan_tier: 'enterprise' }` se auto-concedía el plan más caro.
- **Acceso a grupos privados** en `joinGroup`, que no comprobaba la privacidad.
- **Falta de autenticación** en `courses.toggleCourseActive` y `deleteCourse`.
- **CSP** añadida, con `frame-ancestors 'none'` (la sala pide cámara y micrófono) y
  `Cross-Origin-Opener-Policy`.
- **`search_path`** fijado en los siete triggers `SECURITY DEFINER` del feed.
- **Clerk eliminado**: un segundo proveedor de autenticación en el árbol que no
  autenticaba nada.

### Corregido

- `POST {}` a `/api/chat` devolvía `500`; ahora `400`.
- La telemetría se perdía en los turnos lentos por una promesa flotante.
- `/api/chat` pagaba una segunda llamada al modelo por turno cuyo resultado se
  descartaba.
- Ninguna ruta propagaba `request.signal`, así que cerrar la pestaña no cancelaba la
  llamada; tres no tenían ningún tope de tiempo.
- El aviso al reclutador iba a una dirección incrustada del proveedor, así que nunca
  llegaba al cliente.
- `Date.now()` durante el render en dos componentes: discrepancia de hidratación.
- `FeedList` leía un `useRef` en el render para decidir qué pintar, así que podía
  quedarse en el esqueleto tras terminar la carga.
- Tres `<a>` hacia rutas internas provocaban recarga completa.
- `window.SpeechRecognition` declarado obligatorio, cuando Safari solo expone la
  variante `webkit`.
- Fuga de memoria en la exportación de CV: `revokeObjectURL` solo en el camino feliz.
- `npm test` abría el modo vigilancia y colgaba en CI.
- `server-only` se resolvía como dependencia transitiva de Clerk.
- El contenido de las entrevistas se registraba en los logs del servidor.
- Mensajes de excepción y cuerpos de error de terceros devueltos al cliente.

### Rendimiento

- `recharts` (~200 KB) fuera del bundle inicial del panel.
- `@react-pdf/renderer` (~300 KB) diferido en las dos pantallas que lo usan, una de
  ellas pública con SEO.
- `LandingClient.tsx` dividido de 1068 líneas en once módulos por sección.

### Arquitectura

- `/api/chat` de 939 a 297 líneas: el prompt y la telemetría salen a
  `src/lib/interview/`.
- Nuevo `src/lib/api/`: errores, autenticación, tope de tasa, guardia de URLs
  salientes, cliente tipado de OpenRouter, correo y autorización de entrevista.
- La autorización de las rutas de IA **reutiliza** la prueba de acceso que ya existía
  en `src/lib/candidate-results/`, en lugar de definir un mecanismo paralelo.
- Identificadores de modelo centralizados; `'x-ai/grok-4.20'` aparecía seis veces solo
  en `chat/route.ts`, cinco de ellas en llamadas de telemetría.
- Ocho error boundaries por sección, donde antes solo había uno en la raíz.
- ESLint sobre todo `src/`: se retiraron las 22 rutas ignoradas y se corrigieron los 42
  errores que ocultaban.

### Accesibilidad

- **Cuatro modales operables con teclado.** `HireModal`, `CompareModal`, `ReportModal` y
  `JobDetailModal` no tenían `role="dialog"`, `aria-modal`, trampa de foco ni cierre con
  Escape: al abrirlos el foco se quedaba detrás, tabulando por la página que tapaban, y al
  cerrarlos caía al principio del documento en vez de volver al botón.
- **La sala de entrevista anuncia su estado.** «Grabando», «procesando» y «transcribiendo»
  se comunicaban solo con color y animación, así que para quien usa lector de pantalla no
  había forma de saber si el micrófono estaba abierto durante una entrevista grabada.

### Recursos del navegador

- **La cámara y el micrófono ya se liberan al desmontar.** Solo lo hacía `endInterview()`,
  así que salir de la entrevista por navegación dejaba las pistas capturando y el LED
  encendido.
- **El temporizador ya no se duplica** con un doble clic en «empezar», ni sigue corriendo
  tras abandonar una sesión informativa (`stopTimer` no se llamaba en ningún sitio).
- **Cinco hooks reutilizables**: `useMediaStream`, `useMediaRecorder`, `useTTS`, `useSTT` y
  `useSupabaseRealtime`, con el ciclo de vida garantizado y 38 pruebas.

### Estado de la entrevista

- **Máquina de estados en lugar de cuatro booleanos.** `InterviewRoom` los representaba con
  `isAiSpeaking`, `isRecording`, `isProcessing` e `isTranscribing` independientes: dieciséis
  combinaciones de las que solo cinco significan algo. Entre las otras once, «Zara habla con
  el micrófono abierto», que hacía que el reconocedor transcribiera la voz de Zara y la
  enviara al modelo como respuesta del candidato. Ahora una unión discriminada con tabla
  explícita de transiciones y rechazos registrados (reductor puro, 42 pruebas).
- **El orbe ya no anima sobre silencio.** `setIsAiSpeaking(true)` se hacía antes de que la
  petición del saludo saliera, y durante ese intervalo el botón de hablar salía habilitado.
- **El motivo del cierre se distingue** en el informe: temas completados, tiempo agotado o
  cierre del candidato.

### Accesibilidad

- Los dos desplegables (menú móvil y notificaciones) con `aria-expanded`, `aria-controls`,
  Escape y clic fuera. El menú móvil solo se cerraba pulsando su fondo, que es una acción de
  ratón.
- `prefers-reduced-motion` en las animaciones CSS, incluidas las de bucle infinito del orbe.
- Los quince avatares con `alt` coherente y respaldo de iniciales, centralizados en un
  componente que optimiza cuando el host lo permite y nunca revienta cuando no.

### Pruebas

De 798 a **1 084** en 66 archivos. Cobertura nueva del middleware (33), de la
autorización de `/api/chat` (15), del limitador de tasa (10), de la guardia anti-SSRF
(22), de los esquemas de entrada (25), de los hooks de medios y voz (38), del diálogo
accesible (10), de la redacción de credenciales (12) y del cálculo de la puntuación del
candidato (16), la máquina de estados de la entrevista (42), el desplegable accesible (11),
la autorización de las server actions (31) y las actions que guardan secretos (19).

Cobertura de `src/app/actions` de 2,89 % a 17,21 %; `vitest.config.ts` fija umbrales **por
ruta** para que lo cubierto no retroceda. El objetivo del 70 % en `actions/` no se alcanzó y
`REPORTE_REFACTOR.md` explica por qué no se forzó.

Dos defectos reales aparecieron al escribir las pruebas: la guardia anti-SSRF no
detectaba las IPv4 mapeadas en forma hexadecimal —la única notación que produce
`new URL()`— y los esquemas usaban `z.looseObject`, que propaga las claves no
declaradas en lugar de descartarlas.

---

## [Anterior] - Reclutify AI Growth Phase


### Added
- **Dashboard Analytics**: Real-time KPI metrics in `/admin` displaying candidate volumes, approval rates, and performance statistics utilizing `recharts`.
- **Scorecard PDF Export**: Added `@react-pdf/renderer` to construct downloadable candidate assessment reports in `/admin/report/[id]`.
- **Enterprise Multi-Tenancy**: Built initial Supabase SQL scripts (`supabase/migrations/00001_initial.sql`) for robust organizational RLS policies and schema isolation.
- **Workspace Selection & Onboarding**: Added a visual workspace switcher to the Admin Sidebar Navigation and built an extensive `/onboarding` module for new business setups.
- **CV Intelligence & Parsing**: Built resilient PDF/DOCX parsing engine API (`/api/parse-resume`) resolving Resumes into structured data via OpenRouter models to contextually aid candidate pre-filling. Included an interactive CV-Dropzone directly on the Interview setup.
- **Recruiter Email Notifications**: Integrated `resend` API endpoints at `/api/notifications` that seamlessly intercept end-stage evaluations via `react-email` generated layout templates.
- **AI Bias & Fairness Auditing**: Developed a dedicated Fairness Analytics Dashboard (`/admin/analytics/bias`) exposing role-specific toughness and mapping real-time AI prejudice flags safely.
- **Career Fair (B2B2C Market)**: Established `/career-fair` interface doubling as an engaging kiosk QR-hub engineered for bulk University simulation enrollments.
- **Marketing Upgrades**: Expanded Landing Page copy (`/page.tsx`) to surface the novel v2 technical achievements (PDF, Bias tracking, Universities), incorporating deep comparative insight against ATS alternatives like HireVue.
