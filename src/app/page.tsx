import Link from 'next/link';
import { dictionaries } from '@/lib/i18n';
import {
  Header,
  HeroSection,
  TrustedLogosAnimated,
  TrustedByLabel,
  ProductSection,
  StatsGrid,
  HowItWorksHeading,
  HowItWorksSteps,
  SplitHeading,
  SplitCards,
  TestimonialHeading,
  BigTestimonial,
  TestimonialAttribution,
  SupportingTestimonials,
  ComparisonHeading,
  ComparisonTable,
  OpenRolesSection,
  FinalCTA,
  Footer,
} from './LandingClient';

/**
 * Landing page — Server Component for SEO.
 *
 * All critical text content is rendered as static HTML below (in the default language)
 * so search engines can index it without JavaScript. Client components ("islands")
 * overlay interactive behavior: language switching, animations, scroll parallax,
 * role accordion, and the infinite logo marquee.
 *
 * The `<noscript>` / hidden server-rendered content ensures crawlers always see
 * the full text, while the client components handle interactivity and i18n switching.
 */

// Default language for SSR (matches appStore default)
const t = dictionaries['es'];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] font-sans selection:bg-[#D3FB52] selection:text-black antialiased overflow-x-hidden">
      {/* ─────────────────────────────────────────────────────────────
          HEADER (Client — language toggle, nav links)
         ───────────────────────────────────────────────────────────── */}
      <Header />

      <main>
        {/* ───────────────────────────────────────────────────────────
            HERO — Client island for parallax video + entrance animations
           ─────────────────────────────────────────────────────────── */}
        <HeroSection />

        {/* SEO: Server-rendered hero text (hidden visually, visible to crawlers) */}
        <div className="sr-only" aria-hidden="false">
          <h1>Entrevistas que cuentan algo — Interviews that actually tell you something</h1>
          <p>
            Reclutify reemplaza la llamada de filtro con una conversación adaptativa. Tu equipo recibe
            transcripciones, puntuaciones por rúbrica y una recomendación clara — sin agendar nada.
          </p>
          <p>
            Reclutify replaces the screening call with an adaptive conversation. Your team gets
            transcripts, rubric-based scores, and a clear recommendation — with nothing to schedule.
          </p>
        </div>

        {/* ───────────────────────────────────────────────────────────
            TRUSTED LOGOS — animated marquee (client) with static fallback
           ─────────────────────────────────────────────────────────── */}
        <section className="pb-32 lg:pb-40 px-6 lg:px-8">
          <div className="max-w-[1320px] mx-auto">
            <TrustedByLabel />
            <TrustedLogosAnimated />
          </div>
        </section>

        {/* SEO: Trusted companies (visible to crawlers) */}
        <div className="sr-only" aria-hidden="false">
          <p>Trusted by: WorldBrain, Microsoft, Canva, Deloitte, Dropbox, TikTok, Paysafe, Ubisoft, IBM, Forrester, Samsung, Red Bull, Atlassian</p>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            PRODUCT VALUE PROP — static structure, client for language
           ─────────────────────────────────────────────────────────── */}
        <section id="product" className="px-6 lg:px-8 py-32 lg:py-44">
          <div className="max-w-[1320px] mx-auto">
            <ProductSection />
            <StatsGrid />
          </div>
        </section>

        {/* SEO: Product value prop static text */}
        <div className="sr-only" aria-hidden="false">
          <h2>Menos llamadas. Más señal — Fewer calls. More signal.</h2>
          <p>
            Reemplazamos las primeras horas de filtrado con una conversación de 4 a 30 minutos que
            los candidatos disfrutan — y un reporte que tu equipo realmente lee.
          </p>
          <p>
            Cada entrevista se evalúa con la misma rúbrica, en el mismo orden, sin sesgo de fatiga
            ni &quot;química&quot;. Solo señal.
          </p>
          <ul>
            <li>40h ahorradas a la semana</li>
            <li>4 min entrevista media</li>
            <li>60% menos tiempo a oferta</li>
            <li>24/7 disponibilidad continua</li>
          </ul>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            HOW IT WORKS
           ─────────────────────────────────────────────────────────── */}
        <section id="how-it-works" className="px-6 lg:px-8 py-32 lg:py-44">
          <div className="max-w-[1320px] mx-auto">
            <HowItWorksHeading />
            <HowItWorksSteps />
          </div>
        </section>

        {/* SEO: How it works static text */}
        <div className="sr-only" aria-hidden="false">
          <h2>Tan simple como debería ser — As simple as it should be</h2>
          <ol>
            <li>
              <strong>01 — Crea la vacante:</strong> Define los requisitos. Generamos la rúbrica de
              evaluación y un enlace único en dos minutos.
            </li>
            <li>
              <strong>02 — Envía el enlace:</strong> Cada candidato entra desde su navegador, en su
              horario. Sin instalaciones, sin agendas, sin Zoom.
            </li>
            <li>
              <strong>03 — Lee el reporte:</strong> Recibe puntuaciones por tema, transcripción,
              video, banderas y una recomendación clara. Decide en minutos.
            </li>
          </ol>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            SPLIT — for employers / for candidates
           ─────────────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-8 py-32 lg:py-40">
          <div className="max-w-[1320px] mx-auto">
            <SplitHeading />
            <SplitCards />
          </div>
        </section>

        {/* SEO: Split section static text */}
        <div className="sr-only" aria-hidden="false">
          <h2>Para quién — Built for employers and candidates</h2>
          <h3>{t.roleSplitTitleEmployer}</h3>
          <p>{t.roleSplitSubEmployer}</p>
          <h3>{t.roleSplitTitleCandidate}</h3>
          <p>{t.roleSplitSubCandidate}</p>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            BIG PULL-QUOTE TESTIMONIAL
           ─────────────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-8 py-32 lg:py-48">
          <div className="max-w-[1080px] mx-auto">
            <TestimonialHeading />
            <BigTestimonial />
            <TestimonialAttribution />
          </div>
        </section>

        {/* SEO: Testimonial static text */}
        <div className="sr-only" aria-hidden="false">
          <blockquote>
            &ldquo;Pasamos de revisar 200 CVs por semana a tener entrevistas grabadas listas para
            revisar. La calidad de las contrataciones subió, no bajó.&rdquo;
          </blockquote>
          <p>— Sarah Jenkins, VP de Adquisición de Talento</p>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            SUPPORTING TESTIMONIALS
           ─────────────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-8 py-32 lg:py-40">
          <div className="max-w-[1320px] mx-auto">
            <SupportingTestimonials />
          </div>
        </section>

        {/* SEO: Supporting testimonials static text */}
        <div className="sr-only" aria-hidden="false">
          <blockquote>
            &ldquo;Implementamos Reclutify en Monterrey y redujimos el tiempo de contratación 60%.
            La rúbrica elimina el sesgo de la primera ronda.&rdquo;
            — Ana García Morales, Dir. de Capital Humano
          </blockquote>
          <blockquote>
            &ldquo;Evaluamos +200 candidatos al mes. Cada uno recibe la misma experiencia, sin
            importar la hora o la sucursal.&rdquo;
            — Roberto Méndez, VP de Personas
          </blockquote>
          <blockquote>
            &ldquo;Como startup, necesitábamos algo ágil y económico. Reclutify nos dio nivel
            enterprise por una fracción del costo.&rdquo;
            — Valentina Ospina, Head of Talent
          </blockquote>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            COMPARISON TABLE
           ─────────────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-8 py-32 lg:py-40">
          <div className="max-w-[1080px] mx-auto">
            <ComparisonHeading />
            <ComparisonTable />
          </div>
        </section>

        {/* SEO: Comparison static content */}
        <div className="sr-only" aria-hidden="false">
          <h2>Why Reclutify vs HireVue?</h2>
          <table>
            <thead>
              <tr><th>Feature</th><th>Reclutify</th><th>HireVue</th></tr>
            </thead>
            <tbody>
              <tr><td>Pricing</td><td>From $29/mo</td><td>From $500/mo</td></tr>
              <tr><td>Native Spanish AI</td><td>Yes</td><td>Limited</td></tr>
              <tr><td>Setup Time</td><td>5 minutes</td><td>2-4 weeks</td></tr>
              <tr><td>Built-in Job Board</td><td>Yes</td><td>No</td></tr>
              <tr><td>Bias Detection</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Sentiment Analysis</td><td>Yes</td><td>No</td></tr>
              <tr><td>ATS Webhooks</td><td>Yes</td><td>Yes</td></tr>
            </tbody>
          </table>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            OPEN ROLES — Client island (needs store + accordion)
           ─────────────────────────────────────────────────────────── */}
        <OpenRolesSection />

        {/* SEO: Open positions fallback */}
        <div className="sr-only" aria-hidden="false">
          <h2>{t.openPositions}</h2>
          <p>{t.viewOpenRoles}</p>
        </div>

        {/* hairline divider */}
        <div className="border-t border-white/[0.05]" />

        {/* ───────────────────────────────────────────────────────────
            FINAL CTA
           ─────────────────────────────────────────────────────────── */}
        <FinalCTA />

        {/* SEO: Final CTA static text */}
        <div className="sr-only" aria-hidden="false">
          <h2>Contrata de otra forma — Hire differently</h2>
          <p>
            <Link href="/login?tab=register&role=employer">Comienza gratis — Start for free</Link>
          </p>
          <p>
            <Link href="/pricing">Ver precios — See pricing</Link>
          </p>
        </div>
      </main>

      {/* ───────────────────────────────────────────────────────────
          FOOTER (Client — language-dependent)
         ─────────────────────────────────────────────────────────── */}
      <Footer />

      {/* SEO: Footer links static */}
      <div className="sr-only" aria-hidden="false">
        <nav>
          <p>Reclutify — Entrevistas de IA para equipos que quieren contratar con señal, no con corazonadas.</p>
          <ul>
            <li><Link href="/pricing">Precios</Link></li>
            <li><Link href="/practice">Practice</Link></li>
            <li><Link href="/privacy">Privacidad</Link></li>
            <li><Link href="/terms">Términos</Link></li>
          </ul>
        </nav>
      </div>


    </div>
  );
}
