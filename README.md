# Reclutify — AI Interview Platform

Plataforma SaaS de reclutamiento con inteligencia artificial. Conduce entrevistas
automatizadas con **Zara**, la entrevistadora IA, y genera evaluaciones objetivas con
detección de sesgos.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript estricto · Supabase
(Postgres + Auth + Realtime + Storage) · Tailwind CSS v4 · Framer Motion ·
OpenRouter · Cloudflare R2 · Stripe · Zustand · Vitest

---

## Arquitectura

```
                          ┌──────────────────────────────────────────┐
     Navegador            │            src/middleware.ts             │
  ┌──────────────┐        │  auth.getUser() en CADA petición         │
  │  Candidato   │───────▶│  · 8 prefijos protegidos → /login        │
  │  Empleador   │        │  · enrutado por rol (candidate/employer/ │
  │  Asesor      │        │    coach) y estado de onboarding         │
  └──────────────┘        │  · excepciones: webhooks Stripe,         │
                          │    entrevista pública, token de training │
                          └────────────────┬─────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
   ┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
   │  Server Components │      │   Route Handlers   │      │  Server Actions    │
   │  (lectura inicial) │      │   src/app/api/     │      │  src/app/actions/  │
   └─────────┬──────────┘      └─────────┬──────────┘      └─────────┬──────────┘
             │                           │                           │
             │              ┌────────────┴────────────┐              │
             │              ▼                         ▼              │
             │   ┌────────────────────┐   ┌────────────────────┐     │
             │   │   src/lib/api/     │   │  src/lib/schemas/  │     │
             │   │ · auth             │   │  Zod, con topes de │     │
             │   │ · rate-limit       │   │  longitud          │     │
             │   │ · errors           │   └────────────────────┘     │
             │   │ · outbound-url     │                              │
             │   │ · openrouter       │                              │
             │   │ · interview-access │                              │
             │   └─────────┬──────────┘                              │
             │             │                                         │
             └─────────────┼─────────────────────────────────────────┘
                           ▼
      ┌────────────────────────────────────────────────────────────────┐
      │                       src/utils/supabase/                      │
      │  client (anon, navegador) · server (anon + cookies)            │
      │  middleware (refresco de sesión) · admin (service_role)        │
      └───────────┬───────────────────────────────────┬────────────────┘
                  ▼                                   ▼
      ┌───────────────────────┐          ┌───────────────────────────┐
      │  Supabase Postgres    │          │      Servicios externos   │
      │  · RLS por org        │          │  OpenRouter (IA + TTS)    │
      │  · api_rate_limits    │          │  Cloudflare R2 (vídeo)    │
      │  · interview_telemetry│          │  Stripe · Brevo · Resend  │
      └───────────────────────┘          └───────────────────────────┘
```

### Las dos claves de Supabase, y cuándo se usa cada una

| Cliente | Clave | Dónde | RLS |
|---|---|---|---|
| `createClient()` de `utils/supabase/client` | `anon` | Componentes cliente | **Sí** |
| `createClient()` de `utils/supabase/server` | `anon` + cookies | Server Components y Actions | **Sí** |
| `createClient()` de `utils/supabase/middleware` | `anon` + cookies | Solo middleware | **Sí** |
| `createAdminClient()` de `utils/supabase/admin` | `service_role` | Solo servidor | **No — la salta** |

Regla: **todo endpoint que use `createAdminClient()` valida identidad, organización y
permisos por su cuenta**, porque RLS no lo va a hacer por él. Los helpers de
`src/lib/api/auth.ts` y `src/lib/api/interview-access.ts` existen para eso.

---

## El flujo de entrevista con Zara

### Cómo entra el candidato

Hay tres caminos, y **en dos de ellos el candidato no tiene cuenta**. Es la razón de
que las rutas de IA no puedan limitarse a exigir sesión.

| Camino | Credencial | Página |
|---|---|---|
| Invitación por correo | Token de un solo uso (`interview_tickets`) | `/interview/t/[token]` |
| Enlace general de la vacante | `roles.public_token` | `/interview/public/[publicToken]` |
| Panel del empleador | Sesión de Supabase (`owner`/`admin`) | `/admin/pipeline` |

Esa credencial es la **prueba de acceso** (`src/lib/candidate-results/access-proof.ts`).
La exigen `/api/chat`, `/api/evaluate`, `/api/upload-video`,
`/api/webhooks/candidate-completed` y `/api/candidate-results`.

### El turno de entrevista

```
1. HardwareCheck / QuickDeviceSetup
   Permisos de cámara y micrófono, y compartición de pantalla en modo restringido.

2. InterviewRoom monta y llama a POST /api/chat con isOpeningPhase: true
   ┌─────────────────────────────────────────────────────────────────────┐
   │ /api/chat, en este orden:                                           │
   │  a. chatRequestSchema.parse()          → 400 si la forma no encaja   │
   │  b. requireInterviewAccess()           → 401/403 si no acredita      │
   │  c. enforceRateLimit(AI_CHAT)          → 429 si la cuota se agotó    │
   │  d. computeInterviewPlan()             → presupuesto de preguntas    │
   │     por tema, ponderado por el `weight` de la rúbrica                │
   │  e. computeRealTimePacing()            → urgencia según el reloj     │
   │  f. buildZaraSystemPrompt()            → prompt con 10 reglas duras  │
   │  g. chatCompletion()                   → OpenRouter, con             │
   │     request.signal para cancelar si el candidato se va               │
   │  h. logInterviewTurn()                 → telemetría SIN datos del CV │
   └─────────────────────────────────────────────────────────────────────┘

3. TTS: el texto de Zara va a POST /api/tts y se reproduce.
4. STT: la respuesta del candidato se transcribe con SpeechRecognition.
5. Vuelta al paso 2 con el historial acumulado.

   Zara emite [NEXT_TOPIC] cuando agota el presupuesto del tema, y
   [END_INTERVIEW] al terminar. El cliente los interpreta y avanza.

6. InterviewComplete
   · POST /api/evaluate  → evaluación JSON; la puntuación ponderada se
     RECALCULA en el servidor, no se acepta la del modelo
   · POST /api/upload-video → URL prefirmada de R2; la clave la deriva el
     servidor del orgId que acredita la credencial
   · POST /api/webhooks/candidate-completed → entrega al webhook del
     empleador, cuya URL sale de `webhook_configs`, no del cuerpo
```

El presupuesto de preguntas, la detección de fase y las reglas del prompt están en
`src/lib/interviewTimingEngine.ts` y `src/lib/interview/zara-prompt.ts`.

---

## Puesta en marcha

### Requisitos

- **Node.js** 20+
- **npm** 9+
- Proyecto de **Supabase** (el plan gratuito sirve)
- Clave de **OpenRouter**

### Pasos

1. **Clonar e instalar:**
   ```bash
   git clone https://github.com/DanielAguilarJ/reclutify.git
   cd reclutify
   npm install
   ```

2. **Configurar el entorno:**
   ```bash
   cp .env.example .env.local
   ```
   `.env.example` documenta cada variable, si es obligatoria u opcional, y qué se
   rompe si falta. Las tres imprescindibles para arrancar son
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY`.

3. **Aplicar las migraciones** de `supabase/migrations/` en orden cronológico.

   Las dos más recientes son obligatorias y no son opcionales:

   | Migración | Qué hace | Si no se aplica |
   |---|---|---|
   | `202608020001_api_rate_limits` | Tabla y RPC del limitador de tasa | El limitador cae a un contador en memoria: acota por instancia, no globalmente |
   | `202608020002_close_permissive_read_policies` | Cierra tres políticas permisivas | `interview_telemetry` sigue legible por cualquier cuenta; `notifications` sigue escribible por `anon`; los IDs de Stripe siguen públicos |

   > Centro de capacitación: `docs/training-center-operations.md` documenta el orden
   > de sus migraciones, el endpoint de diagnóstico y el aviso de riesgo de la
   > migración consolidada de reparación.

4. **Arrancar:**
   ```bash
   npm run dev
   ```
   Abre <http://localhost:3000>.

---

## Estructura

```
src/
├── app/
│   ├── actions/          # Server Actions
│   ├── admin/            # Panel del empleador (+ error.tsx)
│   ├── api/              # Route handlers
│   ├── career-fair/      # Bolsa de trabajo pública
│   ├── coach/            # Panel del asesor
│   ├── feed/             # Feed social del candidato
│   ├── informes/         # Sesiones informativas con IA
│   ├── interview/        # Sala de entrevista (3 caminos de entrada)
│   ├── onboarding/       # Alta de candidato / empresa / asesor
│   ├── practice/         # Modo práctica
│   ├── training/         # Centro de capacitación
│   ├── error.tsx         # Error boundary raíz
│   └── global-error.tsx
├── components/
│   ├── admin/charts/     # Único punto de entrada a recharts (lazy)
│   ├── candidate/        # InterviewRoom, HardwareCheck, ...
│   ├── landing/          # Las 11 secciones de la portada
│   └── shared/           # SectionError, navegación, modales
├── lib/
│   ├── api/              # auth · errors · rate-limit · outbound-url ·
│   │                     # openrouter · interview-access · email
│   ├── authz/            # Autorización compartida sesión + organización
│   ├── candidate-results/# Prueba de acceso del candidato
│   ├── interview/        # machine · zara-prompt · telemetry
│   ├── interview-tickets/# Servicio y contratos del ticket
│   ├── coach/            # Redacción de credenciales de integraciones
│   ├── schemas/          # Esquemas Zod de entrada
│   ├── services/         # interview · evaluation
│   └── training/         # Centro de capacitación
├── hooks/                # useMediaStream · useMediaRecorder · useTTS ·
│                         # useSTT · useSupabaseRealtime · useModalDialog ·
│                         # useDisclosure
├── store/                # Zustand
├── types/                # Tipos y ampliaciones del entorno
├── utils/supabase/       # Los cuatro clientes
└── __tests__/            # Vitest
```

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | ESLint sobre **todo** `src/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest en modo vigilancia |
| `npm run test:run` | Vitest en una pasada (**usa esta en CI**) |
| `npm run test:coverage` | Cobertura |
| `npm run verify` | `typecheck` + `lint` + `test:run` |

`npm test` abre el modo vigilancia y no termina: en CI usa `test:run` o `verify`.

### Pruebas

```bash
npm run test:run                                  # las 905
npm run test:run -- src/__tests__/middleware.test.ts   # un archivo
npm run test:run -- -t "rechaza loopback"              # por nombre
npm run test:coverage
```

Convenciones:

- Las pruebas que importan código de servidor llevan `// @vitest-environment node`
  en la primera línea y `vi.mock('server-only', () => ({}))`: `server-only` es un
  centinela de Next que revienta fuera del grafo de servidor.
- Para simular Supabase, `src/__tests__/helpers/fake-supabase.ts` (base en memoria
  con filtros y registro de escrituras). Es el patrón preferido.
- MSW se usa solo donde hace falta interceptar HTTP a nivel de red.

---

## Seguridad

Controles que aplica el código, y dónde:

| Control | Implementación |
|---|---|
| Identidad en servidor | `auth.getUser()` siempre; nunca `getSession()` |
| Autorización de entrevista | `src/lib/api/interview-access.ts` |
| Autorización de organización | `src/lib/api/auth.ts`, `src/lib/authz/` |
| Validación de entrada | `src/lib/schemas/` (Zod, con topes de longitud) |
| Tope de tasa | `src/lib/api/rate-limit.ts` + migración `202608020001` |
| Anti-SSRF | `src/lib/api/outbound-url.ts` |
| Errores sin fugas | `src/lib/api/errors.ts` |
| CSP y cabeceras | `next.config.ts` |
| Aislamiento por organización | RLS + comprobación explícita en cada endpoint |
| Secretos de terceros | `src/lib/coach/integration-secrets.ts` — nunca salen del servidor |
| Estados imposibles | `src/lib/interview/machine.ts` — unión discriminada, no booleanos |

Al añadir un endpoint que use `createAdminClient()`, valida identidad y organización
en el propio endpoint: RLS no interviene ahí.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`REPORTE_REFACTOR.md`](REPORTE_REFACTOR.md) | Auditoría de seguridad y refactor: vulnerabilidades, bugs, rendimiento y deuda restante |
| [`docs/training-center-operations.md`](docs/training-center-operations.md) | Runbook del centro de capacitación |
| [`CHANGELOG.md`](CHANGELOG.md) | Historial de cambios |
| [`.env.example`](.env.example) | Todas las variables de entorno documentadas |

---

## Licencia

Propietario — © WorldBrain EdTech. Todos los derechos reservados.
