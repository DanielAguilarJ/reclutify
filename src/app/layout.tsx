import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reclutify — AI Interview Platform | Entrevistas con IA",
  description:
    "Reclutify: Plataforma de entrevistas con IA para reclutamiento. Conduct AI-powered interviews in English & Spanish. Evaluaciones automáticas, detección de sesgos, y reportes ejecutivos.",
  keywords: ["AI interviews", "entrevistas IA", "HR tech", "reclutamiento", "HireVue alternative", "AI recruiter", "LATAM hiring"],
  openGraph: {
    title: "Reclutify — AI Interview Platform",
    description: "Entrevistas con IA • AI Interviews • From $29/mo",
    locale: "es_MX",
    alternateLocale: ["en_US", "es_ES", "es_CO"],
    type: "website",
    siteName: "Reclutify",
  },
  twitter: {
    card: "summary_large_image",
    title: "Reclutify — AI Interview Platform",
    description: "Entrevistas con IA para empresas en LATAM y España. Desde $29/mes.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Reclutify",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "AI-powered interview platform for HR teams. Conduct interviews in English and Spanish with automatic evaluation.",
    offers: {
      "@type": "Offer",
      price: "29",
      priceCurrency: "USD",
    },
    inLanguage: ["en", "es"],
  };

  return (
    <html lang="es">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
