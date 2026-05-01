import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad',
  description: 'Aviso de Privacidad de Reclutify conforme a la LFPDPPP. Conoce cómo recopilamos, usamos y protegemos tus datos personales.',
  alternates: { canonical: '/privacy' },
};

const sections = [
  {
    title: '1. Identidad y Domicilio del Responsable',
    content: `**WorldBrain EdTech S.A.P.I. de C.V.** (en adelante "Reclutify"), con domicilio en Ciudad de México, México, es la entidad responsable del tratamiento de sus datos personales de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.\n\nCorreo electrónico de contacto: privacidad@reclutify.com`,
  },
  {
    title: '2. Datos Personales que Recopilamos',
    content: `• **Datos de identificación:** nombre completo, correo electrónico, fotografía de perfil.\n• **Datos laborales y académicos:** currículum vitae, experiencia laboral, formación académica, habilidades profesionales, certificaciones.\n• **Datos de la entrevista:** grabaciones de audio y video, transcripciones, evaluaciones generadas por IA, puntuaciones.\n• **Datos de uso:** dirección IP, tipo de navegador, páginas visitadas, duración de sesión.\n• **Datos de la organización (empleadores):** nombre de la empresa, RFC, datos del representante.\n\n**Datos sensibles:** Reclutify no solicita ni recopila deliberadamente datos sensibles como origen étnico, estado de salud, orientación sexual o creencias religiosas. Nuestro sistema incluye detección de sesgos para evitar el procesamiento inadvertido de dichos datos.`,
  },
  {
    title: '3. Finalidades del Tratamiento',
    content: `**Finalidades primarias (necesarias):**\n• Crear y administrar su cuenta de usuario.\n• Facilitar entrevistas con inteligencia artificial, incluyendo grabación, transcripción y evaluación.\n• Generar reportes de evaluación para reclutadores autorizados.\n• Procesar pagos y facturación.\n• Cumplir con obligaciones legales y regulatorias.\n\n**Finalidades secundarias (opcionales):**\n• Enviar comunicaciones de marketing y novedades.\n• Realizar análisis estadísticos y mejora de la plataforma.\n• Personalizar la experiencia del usuario.\n\nSi no desea que sus datos sean tratados para finalidades secundarias, envíe un correo a privacidad@reclutify.com indicando su negativa.`,
  },
  {
    title: '4. Transferencias de Datos',
    content: `Sus datos personales podrán ser transferidos a:\n• **Empresas reclutadoras:** que publiquen vacantes, limitado a datos de perfil y resultados cuando usted aplique a una vacante.\n• **Proveedores tecnológicos:** almacenamiento en la nube (Supabase, Cloudflare), procesamiento de pagos, servicios de correo.\n• **Proveedores de IA:** para procesamiento de entrevistas, sujetos a acuerdos de confidencialidad.\n• **Autoridades competentes:** cuando sea requerido por ley u orden judicial.`,
  },
  {
    title: '5. Derechos ARCO',
    content: `Usted tiene derecho a **Acceder** a sus datos, **Rectificarlos**, **Cancelarlos** u **Oponerse** al tratamiento (derechos ARCO).\n\nPara ejercer sus derechos, envíe solicitud a arco@reclutify.com incluyendo:\n• Nombre completo y correo asociado a su cuenta.\n• Descripción del derecho que desea ejercer.\n• Documentos que acrediten su identidad.\n\nResponderemos en un plazo máximo de 20 días hábiles conforme a la LFPDPPP.`,
  },
  {
    title: '6. Cookies y Tecnologías de Rastreo',
    content: `Reclutify utiliza cookies para mejorar la experiencia del usuario:\n• **Cookies esenciales:** autenticación y sesión.\n• **Cookies analíticas:** análisis de uso con PostHog (privacy-first).\n\nPuede configurar su navegador para rechazar cookies, aunque algunas funciones podrían verse afectadas.`,
  },
  {
    title: '7. Medidas de Seguridad',
    content: `Implementamos medidas de seguridad administrativas, técnicas y físicas:\n• Cifrado de datos en tránsito (TLS/SSL) y en reposo.\n• Autenticación de dos factores.\n• Control de acceso basado en roles (RBAC).\n• Auditorías periódicas de seguridad.\n• Políticas de retención con eliminación programada.`,
  },
  {
    title: '8. Retención de Datos',
    content: `Conservaremos sus datos durante el tiempo necesario para cumplir las finalidades descritas. Las grabaciones de entrevistas se conservarán por un máximo de 12 meses a partir de la entrevista, salvo solicitud de extensión.`,
  },
  {
    title: '9. Cambios al Aviso de Privacidad',
    content: `Nos reservamos el derecho de modificar este Aviso en cualquier momento. Las modificaciones serán notificadas a través de la plataforma y/o por correo electrónico.`,
  },
  {
    title: '10. Autoridad de Protección de Datos',
    content: `Si considera que su derecho a la protección de datos ha sido lesionado, puede interponer una queja ante el Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI): www.inai.org.mx`,
  },
  {
    title: '11. Consentimiento',
    content: `Al registrarse en Reclutify y/o utilizar nuestros servicios, usted manifiesta haber leído y comprendido este Aviso de Privacidad y otorga su consentimiento para el tratamiento de sus datos personales.`,
  },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    const formatted = line
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
    return (
      <p key={i} className={line === '' ? 'h-3' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />
    );
  });
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#1a1b23] text-white font-sans selection:bg-[#D3FB52] selection:text-black">
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#1a1b23]/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm border border-white/20 hover:border-white/40 transition-colors">Log in</Link>
      </header>

      <main className="pt-32 pb-24 px-6">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Aviso de Privacidad</h1>
          <p className="text-neutral-400 text-sm mb-12">Última actualización: 1 de mayo de 2026</p>

          <div className="space-y-10 text-neutral-300 leading-relaxed text-[15px]">
            {sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-xl font-bold text-white mb-3">{s.title}</h2>
                <div className="space-y-2">{renderContent(s.content)}</div>
              </section>
            ))}
          </div>
        </article>
      </main>

      <footer className="bg-[#0b0c10] border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500">
          <p>&copy; {new Date().getFullYear()} WorldBrain EdTech. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <Link href="/terms" className="hover:text-white transition-colors">Términos de Servicio</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Aviso de Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
