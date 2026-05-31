import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Interview Tool Pricing — Plans from $87/mo | Reclutify',
  description: 'AI interview tool pricing from $87/mo. AI screening, automated interviews, AI resume parsing, bias detection. Best HireVue alternative. Free 14-day trial. Precios de entrevistas con IA desde $87/mes.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'AI Interview Tool Pricing — Reclutify',
    description: 'AI hiring platform from $87/mo. AI screening, automated interviews, bias detection. Free trial.',
    url: 'https://www.reclutify.com/pricing',
    type: 'website',
    siteName: 'Reclutify',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Interview Tool — Plans from $87/mo',
    description: 'Best AI interview platform. AI screening + automated hiring. Free 14-day trial.',
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
