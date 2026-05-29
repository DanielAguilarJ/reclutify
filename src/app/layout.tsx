import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://www.reclutify.com"),
  title: {
    template: "%s | Reclutify",
    default: "Reclutify — AI Interview Platform | Entrevistas con IA",
  },
  description:
    "Reclutify: Plataforma de entrevistas con IA para reclutamiento. Conduct AI-powered interviews in English & Spanish. Evaluaciones automáticas, detección de sesgos, y reportes ejecutivos.",
  keywords: ["AI interviews", "entrevistas IA", "HR tech", "reclutamiento", "HireVue alternative", "AI recruiter", "LATAM hiring"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Reclutify — AI Interview Platform",
    description: "Entrevistas con IA • AI Interviews • From $87/mo",
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
        alt: "Reclutify — AI Interview Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reclutify — AI Interview Platform",
    description: "Entrevistas con IA para empresas en LATAM y España. Desde $87/mes.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192x192.png",
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
      description: "AI-powered recruitment platform for HR teams in LATAM and Spain.",
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
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Reclutify",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "AI-powered interview platform for HR teams. Conduct interviews in English and Spanish with automatic evaluation, bias detection, and executive reports.",
      url: "https://www.reclutify.com",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "87",
        highPrice: "297",
        priceCurrency: "USD",
        offerCount: "3",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        reviewCount: "150",
        bestRating: "5",
      },
      inLanguage: ["en", "es"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Reclutify",
      url: "https://www.reclutify.com",
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