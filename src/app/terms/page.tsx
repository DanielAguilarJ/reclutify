import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Términos de Servicio',
  description: 'Términos y Condiciones de Uso de Reclutify. Conoce las reglas que rigen el uso de nuestra plataforma de reclutamiento con IA.',
  alternates: { canonical: '/terms' },
};

const sections = [
  {
    title: '1. Definiciones',
    content: `• **Plataforma:** El sitio web reclutify.com y todas sus aplicaciones asociadas.\n• **Responsable / Reclutify:** WorldBrain EdTech S.A.P.I. de C.V.\n• **Usuario:** Toda persona física o moral que acceda y/o utilice la Plataforma.\n• **Candidato:** Usuario que participa en entrevistas con IA para postularse a vacantes.\n• **Empleador:** Usuario que publica vacantes y utiliza los servicios de evaluación con IA.\n• **Servicios:** Entrevistas con inteligencia artificial, evaluaciones automatizadas, reportes ejecutivos, y demás funcionalidades de la Plataforma.\n• **Contenido:** Toda información, texto, datos, grabaciones, evaluaciones y materiales disponibles en la Plataforma.`,
  },
  {
    title: '2. Aceptación de los Términos',
    content: `Al acceder, registrarse o utilizar la Plataforma, usted acepta estos Términos de Servicio en su totalidad. Si no está de acuerdo con alguno de los términos, debe abstenerse de utilizar la Plataforma.\n\nReclutify se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones entrarán en vigor al momento de su publicación en la Plataforma. El uso continuado de los Servicios después de la publicación de cambios constituye la aceptación de los mismos.`,
  },
  {
    title: '3. Descripción del Servicio',
    content: `Reclutify es una plataforma SaaS de reclutamiento que utiliza inteligencia artificial para:\n• Conducir entrevistas automatizadas en tiempo real (voz y/o texto).\n• Evaluar candidatos mediante rúbricas personalizables con IA.\n• Generar reportes ejecutivos con puntuaciones, análisis de sentimiento y recomendaciones de contratación.\n• Detectar sesgos en el proceso de evaluación.\n• Facilitar la publicación y gestión de vacantes.\n• Proporcionar herramientas de práctica de entrevistas para candidatos.`,
  },
  {
    title: '4. Registro y Cuenta de Usuario',
    content: `• Debe proporcionar información veraz, completa y actualizada al registrarse.\n• Es responsable de mantener la confidencialidad de sus credenciales de acceso.\n• Debe notificar inmediatamente a Reclutify cualquier uso no autorizado de su cuenta.\n• Reclutify se reserva el derecho de suspender o cancelar cuentas que violen estos Términos.\n• Debe tener al menos 18 años de edad para crear una cuenta.`,
  },
  {
    title: '5. Uso Aceptable',
    content: `El Usuario se compromete a:\n• Utilizar la Plataforma únicamente para fines legítimos de reclutamiento y búsqueda de empleo.\n• No publicar contenido falso, engañoso, difamatorio u ofensivo.\n• No intentar acceder a áreas restringidas de la Plataforma sin autorización.\n• No utilizar bots, scrapers u otras herramientas automatizadas no autorizadas.\n• No realizar ingeniería inversa del software o los algoritmos de IA.\n• No compartir credenciales de acceso con terceros.\n• No discriminar a candidatos por motivos de género, origen étnico, religión, edad u orientación sexual.`,
  },
  {
    title: '6. Planes y Pagos',
    content: `• Los precios se muestran en dólares estadounidenses (USD) e incluyen las funcionalidades especificadas en cada plan.\n• Los pagos se procesan de forma recurrente según el ciclo de facturación seleccionado (mensual o anual).\n• Puede cancelar su suscripción en cualquier momento; el acceso continuará hasta el final del periodo pagado.\n• No se realizan reembolsos por periodos parciales, salvo lo dispuesto por la ley aplicable.\n• Reclutify se reserva el derecho de modificar los precios con un aviso previo de 30 días.`,
  },
  {
    title: '7. Propiedad Intelectual',
    content: `• Todo el contenido de la Plataforma, incluyendo software, algoritmos de IA, diseño, logotipos y textos, es propiedad de WorldBrain EdTech o sus licenciantes.\n• Los reportes de evaluación generados por IA son licenciados al Empleador que los solicitó para uso interno de reclutamiento.\n• El Candidato retiene los derechos sobre su información personal y curricular, otorgando a Reclutify una licencia limitada para procesarla conforme a las finalidades descritas en el Aviso de Privacidad.\n• Se prohíbe la reproducción, distribución o uso comercial no autorizado de cualquier contenido de la Plataforma.`,
  },
  {
    title: '8. Inteligencia Artificial y Evaluaciones',
    content: `• Las evaluaciones generadas por IA son herramientas de apoyo y no constituyen una decisión de contratación final.\n• Reclutify no garantiza la exactitud absoluta de las evaluaciones de IA.\n• Los Empleadores son responsables de las decisiones finales de contratación y deben cumplir con la legislación laboral aplicable.\n• Reclutify implementa mecanismos de detección de sesgos, pero no puede garantizar la eliminación total de sesgos algorítmicos.\n• Las grabaciones de entrevistas se almacenan de forma segura y se retienen por un máximo de 12 meses.`,
  },
  {
    title: '9. Limitación de Responsabilidad',
    content: `• Reclutify proporciona los Servicios "tal como están" y "según disponibilidad".\n• No garantizamos la disponibilidad ininterrumpida de la Plataforma.\n• No seremos responsables por daños indirectos, incidentales, especiales o consecuentes derivados del uso de la Plataforma.\n• Nuestra responsabilidad máxima se limita al monto pagado por el Usuario en los últimos 12 meses.\n• No somos responsables por decisiones de contratación tomadas con base en las evaluaciones de IA.`,
  },
  {
    title: '10. Privacidad y Protección de Datos',
    content: `El tratamiento de datos personales se rige por nuestro Aviso de Privacidad, disponible en www.reclutify.com/privacy, el cual forma parte integral de estos Términos.\n\nCumplimos con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y regulaciones aplicables.`,
  },
  {
    title: '11. Terminación',
    content: `• El Usuario puede cancelar su cuenta en cualquier momento desde la configuración de su perfil.\n• Reclutify puede suspender o terminar el acceso de un Usuario que viole estos Términos, sin previo aviso.\n• Tras la terminación, se eliminarán los datos del Usuario conforme a las políticas de retención descritas en el Aviso de Privacidad.\n• Las cláusulas de propiedad intelectual y limitación de responsabilidad sobrevivirán a la terminación.`,
  },
  {
    title: '12. Ley Aplicable y Jurisdicción',
    content: `Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para la interpretación y cumplimiento de estos Términos, las partes se someten a la jurisdicción de los tribunales competentes de la Ciudad de México, renunciando a cualquier otro fuero que pudiere corresponderles.`,
  },
  {
    title: '13. Contacto',
    content: `Para cualquier duda o comentario sobre estos Términos de Servicio, puede contactarnos en:\n• **Correo:** legal@reclutify.com\n• **Sitio web:** www.reclutify.com`,
  },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
    return <p key={i} className={line === '' ? 'h-3' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#1a1b23] text-white font-sans selection:bg-[#D3FB52] selection:text-black">
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#1a1b23]/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm border border-white/20 hover:border-white/40 transition-colors">Log in</Link>
      </header>

      <main className="pt-32 pb-24 px-6">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Términos de Servicio</h1>
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
