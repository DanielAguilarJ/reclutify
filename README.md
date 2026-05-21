# Reclutify — AI Interview Platform

Plataforma SaaS de reclutamiento con inteligencia artificial. Conduce entrevistas automatizadas con Zara, nuestra entrevistadora IA, y genera evaluaciones objetivas con detección de sesgos.

**Stack:** Next.js 15 (App Router) · TypeScript · Supabase · Tailwind CSS v4 · Framer Motion · OpenRouter AI

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.17+ (recommended: 20+)
- **npm** 9+ or **pnpm**
- **Supabase** project (free tier works)
- **OpenRouter** API key

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/DanielAguilarJ/reclutify.git
   cd reclutify
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and fill in your actual values. See [`.env.example`](.env.example) for descriptions of each variable.

4. **Run database migrations:**
   Apply the Supabase migrations in `supabase/migrations/` to your Supabase project.

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Open** [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```
src/
├── app/           # Next.js 15 App Router pages & API routes
│   ├── admin/     # Employer dashboard
│   ├── api/       # API routes (chat, evaluate, tts, etc.)
│   ├── career-fair/ # Public job board
│   ├── feed/      # Candidate social feed
│   ├── interview/ # AI interview room
│   ├── login/     # Authentication
│   ├── messages/  # Real-time messaging
│   ├── network/   # Professional connections
│   ├── onboarding/ # User onboarding flows
│   ├── practice/  # Interview practice mode
│   ├── pricing/   # Pricing page
│   ├── privacy/   # Privacy policy (LFPDPPP)
│   ├── profile/   # User profiles
│   └── terms/     # Terms of service
├── components/    # Reusable React components
├── lib/           # Utilities (i18n, TTS, STT, PostHog)
├── store/         # Zustand state management
└── utils/         # Supabase client/server helpers
```

---

## 🧪 Testing

```bash
npm run test          # Run tests
npm run test:ui       # Run tests with UI
npm run test:coverage # Run tests with coverage
```

---

## 📦 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |

---

## 🔒 Environment Variables

See [`.env.example`](.env.example) for a complete list of required environment variables with descriptions.

**Key services:**
- **Supabase** — Database, auth, real-time
- **OpenRouter** — AI models (Gemini, etc.)
- **Cloudflare R2** — Video storage
- **Resend / Brevo** — Email notifications
- **PostHog** — Privacy-first analytics

---

## 📄 License

Proprietary — © WorldBrain EdTech. All rights reserved.
