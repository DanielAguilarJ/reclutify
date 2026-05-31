import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import PostHogProvider from "@/components/PostHogProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#3b4cca' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1117' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.reclutify.com"),
  title: {
    template: "%s | Reclutify",
    default: "Reclutify — AI Interview Platform | Entrevistas con IA",
  },
  description:
    "Reclutify: #1 AI Interview Tool & Video Interview Platform. AI-powered hiring with one-way video interviews, AI screening, and automated candidate evaluation. The best HireVue alternative for HR teams. Bolsa de trabajo con IA. Interview AI that works 24/7.",
  keywords: ["AI interview", "AI interview tool", "AI hiring", "AI screening", "video interview platform", "video interview software", "AI interview assistant", "interview AI", "one way video interview", "AI recruitment", "AI resume screening", "entrevistas IA", "bolsa de trabajo", "bolsa de empleo", "HR tech", "reclutamiento IA", "HireVue alternative", "AI recruiter", "LATAM hiring", "video interview platform", "automated interview", "interview questions", "empleo", "vacantes", "plataforma de reclutamiento", "AI training", "training software", "onboarding", "ofertas de empleo", "video interview practice", "entrevista de trabajo"],
  alternates: {
    canonical: "/",
    languages: {
      'es': 'https://www.reclutify.com',
      'en': 'https://www.reclutify.com',
      'x-default': 'https://www.reclutify.com',
    },
  },
  openGraph: {
    title: "Reclutify — AI Interview Tool & Video Interview Platform",
    description: "AI-powered video interviews, one-way interviews & AI screening. Video interview software from $87/mo. Trusted by HR teams across LATAM & Spain.",
    url: "https://www.reclutify.com",
    siteName: "Reclutify",
    locale: "es_MX",
    alternateLocale: ["en_US", "es_ES", "es_CO"],
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Reclutify — AI Interview Tool & Hiring Platform for HR Teams",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reclutify — AI Interview Tool for HR Teams",
    description: "AI interviews, AI screening, automated hiring. Trusted by HR teams in LATAM. From $87/mo.",
    images: ["/og-image.png"],
    creator: "@reclutify",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192x192.png",
  },
  robots: {
    index: true,
    follow: true,
    'max-snippet': -1,
    'max-image-preview': 'large',
    'max-video-preview': -1,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Reclutify",
      url: "https://www.reclutify.com",
      logo: "https://www.reclutify.com/icons/icon-512x512.png",
      description: "AI Interview Tool & AI Hiring Platform. The #1 AI interview assistant for HR teams in LATAM and Spain. AI screening, automated interviews, and AI resume parsing.",
      sameAs: [
        "https://www.linkedin.com/company/reclutify",
        "https://twitter.com/reclutify",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        email: "hello@reclutify.com",
        contactType: "customer service",
        availableLanguage: ["Spanish", "English"],
      },
      knowsAbout: ["AI Interview", "AI Screening", "AI Recruitment", "Automated Hiring", "HR Technology", "Employee Onboarding", "AI Training"],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Reclutify — AI Interview Tool",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "AI interview tool and AI hiring platform. Conducts AI-powered interviews with AI screening, automated candidate evaluation, bias detection, and executive reports. Best HireVue alternative for LATAM.",
      url: "https://www.reclutify.com",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "87",
        highPrice: "297",
        priceCurrency: "USD",
        offerCount: "3",
      },
      featureList: "AI Interview Tool, Video Interview Platform, One Way Video Interview, AI Screening, Video Interview Software, AI Resume Screening, Automated Interview, Interview Questions AI, Bias Detection, Employee Onboarding, Training Software",
      inLanguage: ["en", "es"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Reclutify",
      url: "https://www.reclutify.com",
      description: "AI Interview Tool & Bolsa de Trabajo con IA",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://www.reclutify.com/career-fair?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var store = JSON.parse(localStorage.getItem('reclutify-app-store') || '{}');
                  var theme = store.state && store.state.theme ? store.state.theme : 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        <ClerkProvider>
          <PostHogProvider>
          <ToastProvider>
          {children}
          </ToastProvider>
          </PostHogProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}