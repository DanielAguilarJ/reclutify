import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad',
  description: 'Aviso de Privacidad de Reclutify conforme a la LFPDPPP. Conoce c\u00f3mo recopilamos, usamos y protegemos tus datos personales.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Aviso de Privacidad | Reclutify',
    description: 'Conoce c\u00f3mo protegemos tus datos personales conforme a la LFPDPPP.',
    url: '/privacy',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Aviso de Privacidad | Reclutify' },
};

const sections = [
  {
    title: '1. Identidad y Domicilio del Responsable',
    content: `**WorldBrain EdTech S.A.P.I. de C.V.** (en adelante "Reclutify"), con domicilio en Ciudad de M\u00e9xico, M\u00e9xico, es la entidad responsable del tratamiento de sus datos personales de conformidad con la Ley Federal de Protecci\u00f3n de Datos Personales en Posesi\u00f3n de los Particulares (LFPDPPP) y su Reglamento.\n\nCorreo electr\u00f3nico de contacto: privacidad@reclutify.com`,
  },
  {
    title: '2. Datos Personales que Recopilamos',
    content: `\u2022 **Datos de identificaci\u00f3n:** nombre completo, correo electr\u00f3nico, fotograf\u00eda de perfil.\n\u2022 **Datos laborales y acad\u00e9micos:** curr\u00edculum vitae, experiencia laboral, formaci\u00f3n acad\u00e9mica, habilidades profesionales, certificaciones.\n\u2022 **Datos de la entrevista:** grabaciones de audio y video, transcripciones, evaluaciones generadas por IA, puntuaciones.\n\u2022 **Datos de uso:** direcci\u00f3n IP, tipo de navegador, p\u00e1ginas visitadas, duraci\u00f3n de sesi\u00f3n.\n\u2022 **Datos de la organizaci\u00f3n (empleadores):** nombre de la empresa, RFC, datos del representante.\n\n**Datos sensibles:** Reclutify no solicita ni recopila deliberadamente datos sensibles como origen \u00e9tnico, estado de salud, orientaci\u00f3n sexual o creencias religiosas. Nuestro sistema incluye detecci\u00f3n de sesgos para evitar el procesamiento inadvertido de dichos datos.`,
  },
  {
    title: '3. Finalidades del Tratamiento',
    content: `**Finalidades primarias (necesarias):**\n\u2022 Crear y administrar su cuenta de usuario.\n\u2022 Facilitar entrevistas con inteligencia artificial, incluyendo grabaci\u00f3n, transcripci\u00f3n y evaluaci\u00f3n.\n\u2022 Generar reportes de evaluaci\u00f3n para reclutadores autorizados.\n\u2022 Procesar pagos y facturaci\u00f3n.\n\u2022 Cumplir con obligaciones legales y regulatorias.\n\n**Finalidades secundarias (opcionales):**\n\u2022 Enviar comunicaciones de marketing y novedades.\n\u2022 Realizar an\u00e1lisis estad\u00edsticos y mejora de la plataforma.\n\u2022 Personalizar la experiencia del usuario.\n\nSi no desea que sus datos sean tratados para finalidades secundarias, env\u00ede un correo a privacidad@reclutify.com indicando su negativa.`,
  },
  {
    title: '4. Transferencias de Datos',
    content: `Sus datos personales podr\u00e1n ser transferidos a:\n\u2022 **Empresas reclutadoras:** que publiquen vacantes, limitado a datos de perfil y resultados cuando usted aplique a una vacante.\n\u2022 **Proveedores tecnol\u00f3gicos:** almacenamiento en la nube (Supabase, Cloudflare), procesamiento de pagos, servicios de correo.\n\u2022 **Proveedores de IA:** para procesamiento de entrevistas, sujetos a acuerdos de confidencialidad.\n\u2022 **Autoridades competentes:** cuando sea requerido por ley u orden judicial.`,
  },
  {
    title: '5. Derechos ARCO',
    content: `Usted tiene derecho a **Acceder** a sus datos, **Rectificarlos**, **Cancelarlos** u **Oponerse** al tratamiento (derechos ARCO).\n\nPara ejercer sus derechos, env\u00ede solicitud a arco@reclutify.com incluyendo:\n\u2022 Nombre completo y correo asociado a su cuenta.\n\u2022 Descripci\u00f3n del derecho que desea ejercer.\n\u2022 Documentos que acrediten su identidad.\n\nResponderemos en un plazo m\u00e1ximo de 20 d\u00edas h\u00e1biles conforme a la LFPDPPP.`,
  },
  {
    title: '6. Cookies y Tecnolog\u00edas de Rastreo',
    content: `Reclutify utiliza cookies para mejorar la experiencia del usuario:\n\u2022 **Cookies esenciales:** autenticaci\u00f3n y sesi\u00f3n.\n\u2022 **Cookies anal\u00edticas:** an\u00e1lisis de uso con PostHog (privacy-first).\n\nPuede configurar su navegador para rechazar cookies, aunque algunas funciones podr\u00edan verse afectadas.`,
  },
  {
    title: '7. Medidas de Seguridad',
    content: `Implementamos medidas de seguridad administrativas, t\u00e9cnicas y f\u00edsicas:\n\u2022 Cifrado de datos en tr\u00e1nsito (TLS/SSL) y en reposo.\n\u2022 Autenticaci\u00f3n de dos factores.\n\u2022 Control de acceso basado en roles (RBAC).\n\u2022 Auditor\u00edas peri\u00f3dicas de seguridad.\n\u2022 Pol\u00edticas de retenci\u00f3n con eliminaci\u00f3n programada.`,
  },
  {
    title: '8. Retenci\u00f3n de Datos',
    content: `Conservaremos sus datos durante el tiempo necesario para cumplir las finalidades descritas. Las grabaciones de entrevistas se conservar\u00e1n por un m\u00e1ximo de 12 meses a partir de la entrevista, salvo solicitud de extensi\u00f3n.`,
  },
  {
    title: '9. Cambios al Aviso de Privacidad',
    content: `Nos reservamos el derecho de modificar este Aviso en cualquier momento. Las modificaciones ser\u00e1n notificadas a trav\u00e9s de la plataforma y/o por correo electr\u00f3nico.`,
  },
  {
    title: '10. Autoridad de Protecci\u00f3n de Datos',
    content: `Si considera que su derecho a la protecci\u00f3n de datos ha sido lesionado, puede interponer una queja ante el Instituto Nacional de Transparencia, Acceso a la Informaci\u00f3n y Protecci\u00f3n de Datos Personales (INAI): www.inai.org.mx`,
  },
  {
    title: '11. Consentimiento',
    content: `Al registrarse en Reclutify y/o utilizar nuestros servicios, usted manifiesta haber le\u00eddo y comprendido este Aviso de Privacidad y otorga su consentimiento para el tratamiento de sus datos personales.`,
  },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    const formatted = line
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    return (
      <p key={i} className={line === '' ? 'h-3' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />
    );
  });
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm border border-border hover:bg-surface transition-colors">Log in</Link>
      </header>

      <main className="pt-32 pb-24 px-6">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Aviso de Privacidad</h1>
          <p className="text-muted text-sm mb-12">\u00daltima actualizaci\u00f3n: 1 de mayo de 2026</p>

          <div className="space-y-10 text-muted leading-relaxed text-[15px]">
            {sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-xl font-bold text-foreground mb-3">{s.title}</h2>
                <div className="space-y-2">{renderContent(s.content)}</div>
              </section>
            ))}
          </div>
        </article>
      </main>

      <footer className="bg-surface border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-muted">
          <p>&copy; {new Date().getFullYear()} Reclutify. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <Link href="/terms" className="hover:text-foreground transition-colors">T\u00e9rminos de Servicio</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Aviso de Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
