'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ChevronDown, Zap, Crown, Building2, ArrowRight } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAppStore } from '@/store/appStore';

const t = {
  en: {
    title: 'Simple, transparent pricing',
    subtitle: 'Start for free. Scale as you grow. No hidden fees.',
    monthly: 'Monthly',
    annual: 'Annual',
    annualSave: 'Save 20%',
    perMonth: '/mo',
    billedAnnually: 'billed annually',
    popular: 'Most Popular',
    getStarted: 'Get Started',
    contactSales: 'Contact Sales',
    currentPlan: 'Current Plan',
    starter: {
      name: 'Starter',
      desc: 'Perfect for small teams starting with AI interviews.',
      price: 29,
      interviews: '30 interviews/mo',
      features: [
        { text: 'AI Interviewer (Zara)', included: true },
        { text: 'AI Evaluations & Reports', included: true },
        { text: 'Video Recording', included: true },
        { text: 'Up to 3 active roles', included: true },
        { text: 'Custom AI Rubrics', included: true },
        { text: 'Transcript Export', included: false },
        { text: 'Priority Support', included: false },
        { text: 'White Label Branding', included: false },
        { text: 'API Access', included: false },
      ],
    },
    pro: {
      name: 'Pro',
      desc: 'For growing teams that need more power and insights.',
      price: 79,
      interviews: '150 interviews/mo',
      features: [
        { text: 'AI Interviewer (Zara)', included: true },
        { text: 'AI Evaluations & Reports', included: true },
        { text: 'Video Recording', included: true },
        { text: 'Up to 10 active roles', included: true },
        { text: 'Custom AI Rubrics', included: true },
        { text: 'Transcript Export', included: true },
        { text: 'Priority Support', included: true },
        { text: 'White Label Branding', included: false },
        { text: 'API Access', included: false },
      ],
    },
    enterprise: {
      name: 'Enterprise',
      desc: 'For organizations hiring at scale with custom needs.',
      price: 199,
      interviews: 'Unlimited interviews',
      features: [
        { text: 'AI Interviewer (Zara)', included: true },
        { text: 'AI Evaluations & Reports', included: true },
        { text: 'Video Recording', included: true },
        { text: 'Unlimited active roles', included: true },
        { text: 'Custom AI Rubrics', included: true },
        { text: 'Transcript Export', included: true },
        { text: 'Priority Support', included: true },
        { text: 'White Label Branding', included: true },
        { text: 'API Access', included: true },
      ],
    },
    faqTitle: 'Frequently Asked Questions',
    faqs: [
      {
        q: 'How does AI interviewing work?',
        a: 'Our AI interviewer, Zara, conducts real-time voice interviews with your candidates. She asks adaptive questions based on the role, evaluates responses, and generates a detailed report with scores, pros, cons, and a hiring recommendation.',
      },
      {
        q: 'Can I try it before paying?',
        a: 'Yes! Contact us for a free demo where you can experience the full interview process as a candidate. No credit card required.',
      },
      {
        q: 'What happens if I exceed my interview limit?',
        a: 'We\'ll notify you when you\'re close to your limit. You can upgrade your plan anytime or purchase additional interview packs at $1.50 per interview.',
      },
      {
        q: 'Is my data secure?',
        a: 'Absolutely. All interviews are encrypted end-to-end. Video recordings and transcripts are stored securely on enterprise-grade cloud infrastructure. We comply with GDPR and data protection regulations.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes, you can cancel your subscription at any time. Your access continues until the end of your billing period. No cancellation fees.',
      },
      {
        q: 'Do you offer custom solutions?',
        a: 'Yes, our Enterprise plan includes custom integrations, dedicated support, and white-label options. Contact our sales team to discuss your specific needs.',
      },
    ],
    ctaTitle: 'Ready to transform your hiring?',
    ctaSub: 'Join thousands of companies using AI to hire faster and smarter.',
    ctaButton: 'Start Free Trial',
  },
  es: {
    title: 'Precios simples y transparentes',
    subtitle: 'Empieza gratis. Escala según crezcas. Sin costos ocultos.',
    monthly: 'Mensual',
    annual: 'Anual',
    annualSave: 'Ahorra 20%',
    perMonth: '/mes',
    billedAnnually: 'facturado anualmente',
    popular: 'Más Popular',
    getStarted: 'Comenzar',
    contactSales: 'Contactar Ventas',
    currentPlan: 'Plan Actual',
    starter: {
      name: 'Starter',
      desc: 'Perfecto para equipos pequeños que inician con entrevistas IA.',
      price: 29,
      interviews: '30 entrevistas/mes',
      features: [
        { text: 'Entrevistadora IA (Zara)', included: true },
        { text: 'Evaluaciones y Reportes IA', included: true },
        { text: 'Grabación de Video', included: true },
        { text: 'Hasta 3 roles activos', included: true },
        { text: 'Rúbricas IA Personalizadas', included: true },
        { text: 'Exportación de Transcripción', included: false },
        { text: 'Soporte Prioritario', included: false },
        { text: 'Marca Blanca', included: false },
        { text: 'Acceso API', included: false },
      ],
    },
    pro: {
      name: 'Pro',
      desc: 'Para equipos en crecimiento que necesitan más poder e insights.',
      price: 79,
      interviews: '150 entrevistas/mes',
      features: [
        { text: 'Entrevistadora IA (Zara)', included: true },
        { text: 'Evaluaciones y Reportes IA', included: true },
        { text: 'Grabación de Video', included: true },
        { text: 'Hasta 10 roles activos', included: true },
        { text: 'Rúbricas IA Personalizadas', included: true },
        { text: 'Exportación de Transcripción', included: true },
        { text: 'Soporte Prioritario', included: true },
        { text: 'Marca Blanca', included: false },
        { text: 'Acceso API', included: false },
      ],
    },
    enterprise: {
      name: 'Enterprise',
      desc: 'Para organizaciones que contratan a gran escala con necesidades personalizadas.',
      price: 199,
      interviews: 'Entrevistas ilimitadas',
      features: [
        { text: 'Entrevistadora IA (Zara)', included: true },
        { text: 'Evaluaciones y Reportes IA', included: true },
        { text: 'Grabación de Video', included: true },
        { text: 'Roles activos ilimitados', included: true },
        { text: 'Rúbricas IA Personalizadas', included: true },
        { text: 'Exportación de Transcripción', included: true },
        { text: 'Soporte Prioritario', included: true },
        { text: 'Marca Blanca', included: true },
        { text: 'Acceso API', included: true },
      ],
    },
    faqTitle: 'Preguntas Frecuentes',
    faqs: [
      {
        q: '¿Cómo funcionan las entrevistas con IA?',
        a: 'Nuestra entrevistadora IA, Zara, realiza entrevistas de voz en tiempo real con tus candidatos. Hace preguntas adaptativas según el rol, evalúa respuestas y genera un reporte detallado con puntajes, pros, contras y recomendación de contratación.',
      },
      {
        q: '¿Puedo probarlo antes de pagar?',
        a: '¡Sí! Contáctanos para una demo gratuita donde puedes experimentar todo el proceso de entrevista como candidato. No se requiere tarjeta de crédito.',
      },
      {
        q: '¿Qué pasa si excedo mi límite de entrevistas?',
        a: 'Te notificaremos cuando estés cerca de tu límite. Puedes actualizar tu plan en cualquier momento o comprar paquetes adicionales de entrevistas a $1.50 USD por entrevista.',
      },
      {
        q: '¿Mis datos están seguros?',
        a: 'Absolutamente. Todas las entrevistas están encriptadas de extremo a extremo. Las grabaciones de video y transcripciones se almacenan de forma segura en infraestructura cloud empresarial. Cumplimos con GDPR y regulaciones de protección de datos.',
      },
      {
        q: '¿Puedo cancelar en cualquier momento?',
        a: 'Sí, puedes cancelar tu suscripción en cualquier momento. Tu acceso continúa hasta el final de tu periodo de facturación. Sin cargos por cancelación.',
      },
      {
        q: '¿Ofrecen soluciones personalizadas?',
        a: 'Sí, nuestro plan Enterprise incluye integraciones personalizadas, soporte dedicado y opciones de marca blanca. Contacta a nuestro equipo de ventas para discutir tus necesidades específicas.',
      },
    ],
    ctaTitle: '¿Listo para transformar tu contratación?',
    ctaSub: 'Únete a miles de empresas que usan IA para contratar más rápido y mejor.',
    ctaButton: 'Prueba Gratis',
  },
};

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="text-lg font-medium text-white group-hover:text-[#D3FB52] transition-colors pr-8">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-neutral-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180 text-[#D3FB52]' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-neutral-400 leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PricingPage() {
  const { language } = useAppStore();
  const d = t[language] || t.en;
  const [annual, setAnnual] = useState(false);

  const plans = [
    { ...d.starter, icon: Zap, color: '#D3FB52', tier: 'starter' },
    { ...d.pro, icon: Crown, color: '#00D3D8', tier: 'pro' },
    { ...d.enterprise, icon: Building2, color: '#b56afa', tier: 'enterprise' },
  ];

  const getPrice = (base: number) => {
    if (annual) return Math.round(base * 0.8);
    return base;
  };

  return (
    <div className="min-h-screen bg-[#1a1b23] text-white font-sans selection:bg-[#D3FB52] selection:text-black">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#1a1b23]/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <Link
            href="/login"
            className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm border border-white/20 hover:border-white/40 transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="pt-32 pb-24 px-6">
        {/* Title */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold tracking-tight mb-6"
          >
            {d.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-neutral-400"
          >
            {d.subtitle}
          </motion.p>
        </div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-4 mb-16"
        >
          <span className={`text-sm font-medium ${!annual ? 'text-white' : 'text-neutral-500'}`}>
            {d.monthly}
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className="relative w-14 h-7 rounded-full bg-white/10 border border-white/10 p-0.5 transition-colors"
          >
            <motion.div
              animate={{ x: annual ? 26 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-6 h-6 rounded-full bg-[#D3FB52]"
            />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-white' : 'text-neutral-500'}`}>
            {d.annual}
          </span>
          {annual && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-xs font-bold bg-[#D3FB52]/20 text-[#D3FB52] px-3 py-1 rounded-full"
            >
              {d.annualSave}
            </motion.span>
          )}
        </motion.div>

        {/* Pricing Cards */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, i) => {
            const isPro = plan.tier === 'pro';
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.tier}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`relative flex flex-col rounded-3xl border p-8 transition-all duration-300 hover:scale-[1.02] ${
                  isPro
                    ? 'bg-gradient-to-b from-[#00D3D8]/10 to-transparent border-[#00D3D8]/30 shadow-[0_0_60px_rgba(0,211,216,0.08)]'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#00D3D8] text-black text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                      {d.popular}
                    </span>
                  </div>
                )}

                <div className="mb-8">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                    style={{ backgroundColor: `${plan.color}20` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: plan.color }} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">{plan.desc}</p>
                </div>

                <div className="mb-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-white">${getPrice(plan.price)}</span>
                    <span className="text-neutral-400 text-sm">{d.perMonth}</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-neutral-500 mt-1">
                      ${getPrice(plan.price) * 12} USD {d.billedAnnually}
                    </p>
                  )}
                </div>

                <div className="text-sm font-medium text-[#D3FB52] mb-8">{plan.interviews}</div>

                <div className="flex-1 space-y-4 mb-8">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-center gap-3">
                      {f.included ? (
                        <div className="w-5 h-5 rounded-full bg-[#D3FB52]/20 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-[#D3FB52]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                          <X className="w-3 h-3 text-neutral-600" />
                        </div>
                      )}
                      <span className={`text-sm ${f.included ? 'text-neutral-300' : 'text-neutral-600'}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
                    isPro
                      ? 'bg-[#00D3D8] text-black hover:bg-[#00bfc4] shadow-lg shadow-[#00D3D8]/20'
                      : plan.tier === 'enterprise'
                      ? 'bg-white/10 text-white hover:bg-white/15 border border-white/10'
                      : 'bg-[#D3FB52] text-black hover:bg-[#c1e847]'
                  }`}
                >
                  {plan.tier === 'enterprise' ? d.contactSales : d.getStarted}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto mt-32">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
            {d.faqTitle}
          </h2>
          <div className="border-t border-white/10">
            {d.faqs.map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="max-w-4xl mx-auto mt-32 text-center">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#D3FB52]/10 via-[#00D3D8]/10 to-[#b56afa]/10 border border-white/10 p-12 md:p-16">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxIiBjeT0iMSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {d.ctaTitle}
              </h2>
              <p className="text-lg text-neutral-400 mb-8 max-w-xl mx-auto">
                {d.ctaSub}
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-[#D3FB52] text-black font-semibold px-8 py-4 rounded-xl hover:bg-[#c1e847] transition-colors text-lg"
              >
                {d.ctaButton}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0b0c10] border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500">
          <p>© {new Date().getFullYear()} WorldBrain EdTech. {language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}</p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
