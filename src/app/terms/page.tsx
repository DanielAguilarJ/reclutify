import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'T\u00e9rminos de Servicio',
  description: 'T\u00e9rminos y Condiciones de Uso de Reclutify. Conoce las reglas que rigen el uso de nuestra plataforma de reclutamiento con IA.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'T\u00e9rminos de Servicio | Reclutify',
    description: 'Condiciones de uso de la plataforma de reclutamiento con IA Reclutify.',
    url: '/terms',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'T\u00e9rminos de Servicio | Reclutify' },
};

const sections = [
  {
    title: '1. Definiciones',
    content: `\u2022 **Plataforma:** El sitio web reclutify.com y todas sus aplicaciones asociadas.\n\u2022 **Responsable / Reclutify:** WorldBrain EdTech S.A.P.I. de C.V.\n\u2022 **Usuario:** Toda persona f\u00edsica o moral que acceda y/o utilice la Plataforma.\n\u2022 **Candidato:** Usuario que participa en entrevistas con IA para postularse a vacantes.\n\u2022 **Empleador:** Usuario que publica vacantes y utiliza los servicios de evaluaci\u00f3n con IA.\n\u2022 **Servicios:** Entrevistas con inteligencia artificial, evaluaciones automatizadas, reportes ejecutivos, y dem\u00e1s funcionalidades de la Plataforma.\n\u2022 **Contenido:** Toda informaci\u00f3n, texto, datos, grabaciones, evaluaciones y materiales disponibles en la Plataforma.`,
  },
  {
    title: '2. Aceptaci\u00f3n de los T\u00e9rminos',
    content: `Al acceder, registrarse o utilizar la Plataforma, usted acepta estos T\u00e9rminos de Servicio en su totalidad. Si no est\u00e1 de acuerdo con alguno de los t\u00e9rminos, debe abstenerse de utilizar la Plataforma.\n\nReclutify se reserva el derecho de modificar estos T\u00e9rminos en cualquier momento. Las modificaciones entrar\u00e1n en vigor al momento de su publicaci\u00f3n en la Plataforma. El uso continuado de los Servicios despu\u00e9s de la publicaci\u00f3n de cambios constituye la aceptaci\u00f3n de los mismos.`,
  },
  {
    title: '3. Descripci\u00f3n del Servicio',
    content: `Reclutify es una plataforma SaaS de reclutamiento que utiliza inteligencia artificial para:\n\u2022 Conducir entrevistas automatizadas en tiempo real (voz y/o texto).\n\u2022 Evaluar candidatos mediante r\u00fabricas personalizables con IA.\n\u2022 Generar reportes ejecutivos con puntuaciones, an\u00e1lisis de sentimiento y recomendaciones de contrataci\u00f3n.\n\u2022 Detectar sesgos en el proceso de evaluaci\u00f3n.\n\u2022 Facilitar la publicaci\u00f3n y gesti\u00f3n de vacantes.\n\u2022 Proporcionar herramientas de pr\u00e1ctica de entrevistas para candidatos.`,
  },
  {
    title: '4. Registro y Cuenta de Usuario',
    content: `\u2022 Debe proporcionar informaci\u00f3n veraz, completa y actualizada al registrarse.\n\u2022 Es responsable de mantener la confidencialidad de sus credenciales de acceso.\n\u2022 Debe notificar inmediatamente a Reclutify cualquier uso no autorizado de su cuenta.\n\u2022 Reclutify se reserva el derecho de suspender o cancelar cuentas que violen estos T\u00e9rminos.\n\u2022 Debe tener al menos 18 a\u00f1os de edad para crear una cuenta.`,
  },
  {
    title: '5. Uso Aceptable',
    content: `El Usuario se compromete a:\n\u2022 Utilizar la Plataforma \u00fanicamente para fines leg\u00edtimos de reclutamiento y b\u00fasqueda de empleo.\n\u2022 No publicar contenido falso, enga\u00f1oso, difamatorio u ofensivo.\n\u2022 No intentar acceder a \u00e1reas restringidas de la Plataforma sin autorizaci\u00f3n.\n\u2022 No utilizar bots, scrapers u otras herramientas automatizadas no autorizadas.\n\u2022 No realizar ingenier\u00eda inversa del software o los algoritmos de IA.\n\u2022 No compartir credenciales de acceso con terceros.\n\u2022 No discriminar a candidatos por motivos de g\u00e9nero, origen \u00e9tnico, religi\u00f3n, edad u orientaci\u00f3n sexual.`,
  },
  {
    title: '6. Planes y Pagos',
    content: `\u2022 Los precios se muestran en d\u00f3lares estadounidenses (USD) e incluyen las funcionalidades especificadas en cada plan.\n\u2022 Los pagos se procesan de forma recurrente seg\u00fan el ciclo de facturaci\u00f3n seleccionado (mensual o anual).\n\u2022 Puede cancelar su suscripci\u00f3n en cualquier momento; el acceso continuar\u00e1 hasta el final del periodo pagado.\n\u2022 No se realizan reembolsos por periodos parciales, salvo lo dispuesto por la ley aplicable.\n\u2022 Reclutify se reserva el derecho de modificar los precios con un aviso previo de 30 d\u00edas.`,
  },
  {
    title: '7. Propiedad Intelectual',
    content: `\u2022 Todo el contenido de la Plataforma, incluyendo software, algoritmos de IA, dise\u00f1o, logotipos y textos, es propiedad de WorldBrain EdTech o sus licenciantes.\n\u2022 Los reportes de evaluaci\u00f3n generados por IA son licenciados al Empleador que los solicit\u00f3 para uso interno de reclutamiento.\n\u2022 El Candidato retiene los derechos sobre su informaci\u00f3n personal y curricular, otorgando a Reclutify una licencia limitada para procesarla conforme a las finalidades descritas en el Aviso de Privacidad.\n\u2022 Se proh\u00edbe la reproducci\u00f3n, distribuci\u00f3n o uso comercial no autorizado de cualquier contenido de la Plataforma.`,
  },
  {
    title: '8. Inteligencia Artificial y Evaluaciones',
    content: `\u2022 Las evaluaciones generadas por IA son herramientas de apoyo y no constituyen una decisi\u00f3n de contrataci\u00f3n final.\n\u2022 Reclutify no garantiza la exactitud absoluta de las evaluaciones de IA.\n\u2022 Los Empleadores son responsables de las decisiones finales de contrataci\u00f3n y deben cumplir con la legislaci\u00f3n laboral aplicable.\n\u2022 Reclutify implementa mecanismos de detecci\u00f3n de sesgos, pero no puede garantizar la eliminaci\u00f3n total de sesgos algor\u00edtmicos.\n\u2022 Las grabaciones de entrevistas se almacenan de forma segura y se retienen por un m\u00e1ximo de 12 meses.`,
  },
  {
    title: '9. Limitaci\u00f3n de Responsabilidad',
    content: `\u2022 Reclutify proporciona los Servicios "tal como est\u00e1n" y "seg\u00fan disponibilidad".\n\u2022 No garantizamos la disponibilidad ininterrumpida de la Plataforma.\n\u2022 No seremos responsables por da\u00f1os indirectos, incidentales, especiales o consecuentes derivados del uso de la Plataforma.\n\u2022 Nuestra responsabilidad m\u00e1xima se limita al monto pagado por el Usuario en los \u00faltimos 12 meses.\n\u2022 No somos responsables por decisiones de contrataci\u00f3n tomadas con base en las evaluaciones de IA.`,
  },
  {
    title: '10. Privacidad y Protecci\u00f3n de Datos',
    content: `El tratamiento de datos personales se rige por nuestro Aviso de Privacidad, disponible en www.reclutify.com/privacy, el cual forma parte integral de estos T\u00e9rminos.\n\nCumplimos con la Ley Federal de Protecci\u00f3n de Datos Personales en Posesi\u00f3n de los Particulares (LFPDPPP) y regulaciones aplicables.`,
  },
  {
    title: '11. Terminaci\u00f3n',
    content: `\u2022 El Usuario puede cancelar su cuenta en cualquier momento desde la configuraci\u00f3n de su perfil.\n\u2022 Reclutify puede suspender o terminar el acceso de un Usuario que viole estos T\u00e9rminos, sin previo aviso.\n\u2022 Tras la terminaci\u00f3n, se eliminar\u00e1n los datos del Usuario conforme a las pol\u00edticas de retenci\u00f3n descritas en el Aviso de Privacidad.\n\u2022 Las cl\u00e1usulas de propiedad intelectual y limitaci\u00f3n de responsabilidad sobrevivir\u00e1n a la terminaci\u00f3n.`,
  },
  {
    title: '12. Ley Aplicable y Jurisdicci\u00f3n',
    content: `Estos T\u00e9rminos se rigen por las leyes de los Estados Unidos Mexicanos. Para la interpretaci\u00f3n y cumplimiento de estos T\u00e9rminos, las partes se someten a la jurisdicci\u00f3n de los tribunales competentes de la Ciudad de M\u00e9xico, renunciando a cualquier otro fuero que pudiere corresponderles.`,
  },
  {
    title: '13. Contacto',
    content: `Para cualquier duda o comentario sobre estos T\u00e9rminos de Servicio, puede contactarnos en:\n\u2022 **Correo:** legal@reclutify.com\n\u2022 **Sitio web:** www.reclutify.com`,
  },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    return <p key={i} className={line === '' ? 'h-3' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl">
        <Link href="/"><Logo /></Link>
        <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm border border-border hover:bg-surface transition-colors">Log in</Link>
      </header>

      <main className="pt-32 pb-24 px-6">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">T\u00e9rminos de Servicio</h1>
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
