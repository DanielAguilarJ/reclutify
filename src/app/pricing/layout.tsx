import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Video Interview Platform Pricing — AI Interview Software from $87 | Reclutify',
  description: 'Video interview platform and AI interview tool pricing from $87/mo. One-way video interview software with AI screening, automated evaluation. Best HireVue alternative. Free 14-day trial.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Video Interview Software Pricing — Reclutify',
    description: 'AI interview tool & video interview platform from $87/mo. AI screening, one-way interviews, automated hiring.',
    url: 'https://www.reclutify.com/pricing',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Interview & Video Interview Software — from $87/mo',
    description: 'Video interview platform with AI. One-way interviews + AI screening. Free trial.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '¿Cuánto cuesta Reclutify?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Reclutify tiene 3 planes: Starter ($87/mes, 50 entrevistas), Pro ($167/mes, 200 entrevistas), y Enterprise ($297/mes, entrevistas ilimitadas). Todos incluyen evaluaciones con IA y detección de sesgos.',
        },
      },
      {
        '@type': 'Question',
        name: '¿Hay prueba gratuita?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sí, todos los planes incluyen 14 días de prueba gratuita sin necesidad de tarjeta de crédito.',
        },
      },
      {
        '@type': 'Question',
        name: '¿En qué idiomas funciona la entrevista con IA?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Las entrevistas con IA de Reclutify funcionan en español e inglés. La IA se adapta automáticamente al idioma del candidato.',
        },
      },
      {
        '@type': 'Question',
        name: '¿Puedo cancelar en cualquier momento?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sí, puedes cancelar tu suscripción en cualquier momento desde el panel de control. No hay contratos de permanencia.',
        },
      },
      {
        '@type': 'Question',
        name: '¿Cómo funciona la detección de sesgos?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Nuestra IA analiza cada evaluación para detectar posibles sesgos lingüísticos, de género, culturales o de edad, garantizando un proceso de selección justo y equitativo.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
