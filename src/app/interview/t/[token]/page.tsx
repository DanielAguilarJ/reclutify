'use client';

import { use, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Logo from '@/components/ui/Logo';
import DetailsForm from '@/components/candidate/DetailsForm';
import InterviewOverview from '@/components/candidate/InterviewOverview';

import HardwareCheck from '@/components/candidate/HardwareCheck';
import QuickDeviceSetup from '@/components/candidate/QuickDeviceSetup';
import InterviewRoom from '@/components/candidate/InterviewRoom';
import InterviewComplete from '@/components/candidate/InterviewComplete';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import {
  consumeInterviewTicket,
  fetchInterviewTicket,
} from '@/lib/interview-tickets/client';
import { ShieldX, Clock, CheckCircle2 } from 'lucide-react';

type TicketStatus = 'loading' | 'valid' | 'invalid' | 'used' | 'expired';

export default function TicketInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { phase, setTopics, setCandidate, setPhase, setRoleId, setInterviewDuration, setInterviewMode, interviewMode } = useInterviewStore();
  const { language, setLanguage } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('loading');
  const [localRoleId, setLocalRoleId] = useState('');
  const [candidateName, setCandidateName] = useState('');
  // FIX 7: Track whether the ticket has been marked used so we only do it once
  // and only after the candidate actually enters the InterviewRoom.
  const [ticketMarked, setTicketMarked] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  // White-label: org plan fetched from DB (not localStorage)
  const [orgPlanTier, setOrgPlanTier] = useState<string>('starter');

  // El ticket, el puesto y el plan de la organización los resuelve
  // `/api/interview/ticket` con la clave de servicio. Antes esta pantalla hacía
  // esas tres lecturas desde el navegador con la clave anon, lo que obligaba a
  // mantener `SELECT TO anon USING (true)` sobre `interview_tickets`: cualquiera
  // con la clave pública podía listar todos los tokens del sistema y entrar a la
  // entrevista de cualquier candidato.
  //
  // También se eliminó el respaldo que aceptaba el ticket y el puesto completo
  // —con sus criterios de evaluación— en un payload base64 del parámetro `?d=`
  // de la URL. Ese atajo abría una entrevista funcional sin ticket real, con los
  // temas que eligiera quien fabricara el enlace y gastando crédito de IA: era un
  // puente que anulaba cualquier control de servidor, así que no queda nada que
  // pueda inyectar estado desde la URL.
  useEffect(() => {
    let cancelled = false;

    const checkTicket = async () => {
      const result = await fetchInterviewTicket(token);
      if (cancelled) return;

      if (result.status === 'used') {
        setTicketStatus('used');
        return;
      }

      if (result.status === 'expired') {
        setTicketStatus('expired');
        return;
      }

      if (result.status !== 'valid') {
        setTicketStatus('invalid');
        return;
      }

      const { ticket, role, org } = result;

      setTopics(role.topics);
      setLocalRoleId(role.id);
      setRoleId(role.id);
      setInterviewDuration(role.interviewDuration);
      setInterviewMode(role.interviewMode);
      setCandidateName(ticket.candidateName);

      // Marca blanca del encabezado.
      setOrgPlanTier(org.planTier);

      // Idioma de la entrevista, tomado del ticket.
      setLanguage(ticket.language);

      // Pre-llenar info del candidato
      setCandidate({
        name: ticket.candidateName,
        email: '',
        phone: '',
      });

      // FIX 7: el ticket no se quema aquí. Solo cuando el candidato entra de
      // verdad a la sala (phase === 'interview'), para que cerrar el navegador
      // antes no le cueste el enlace.
      setPendingToken(token);

      // Iniciar en el formulario de detalles
      setPhase('details');
      setTicketStatus('valid');
    };

    checkTicket();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // FIX 7: Burn the ticket only when the interview actually starts, not at validation time.
  // This way, candidates who close the browser on DetailsForm/Overview/HardwareCheck
  // can re-open the same link and resume.
  useEffect(() => {
    if (phase === 'interview' && pendingToken && !ticketMarked) {
      setTicketMarked(true);
      // El resultado no cambia lo que ve el candidato, igual que antes: si el
      // consumo falla, la entrevista sigue.
      void consumeInterviewTicket(pendingToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Pantallas de error
  if (ticketStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-3 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted">{es ? 'Verificando ticket...' : 'Verifying ticket...'}</p>
        </div>
      </div>
    );
  }

  if (ticketStatus === 'invalid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-5">
            <ShieldX className="h-8 w-8 text-danger" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es ? 'Ticket Inválido' : 'Invalid Ticket'}
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            {es
              ? 'Este link de entrevista no es válido. Contacta al equipo de recursos humanos para obtener un link válido.'
              : 'This interview link is not valid. Contact the HR team for a valid link.'}
          </p>
        </div>
      </div>
    );
  }

  if (ticketStatus === 'used') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es ? 'Ticket Ya Utilizado' : 'Ticket Already Used'}
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            {es
              ? 'Este link de entrevista ya fue utilizado. Cada ticket solo se puede usar una vez.'
              : 'This interview link has already been used. Each ticket can only be used once.'}
          </p>
        </div>
      </div>
    );
  }

  if (ticketStatus === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-5">
            <Clock className="h-8 w-8 text-warning" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {es ? 'Ticket Expirado' : 'Ticket Expired'}
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            {es
              ? 'Este link de entrevista ha expirado. Los tickets son válidos por 24 horas. Contacta al equipo de recursos humanos.'
              : 'This interview link has expired. Tickets are valid for 24 hours. Contact the HR team.'}
          </p>
        </div>
      </div>
    );
  }

  // Ticket válido — mostrar flujo de entrevista
  if (phase === 'interview') {
    return <InterviewRoom roleId={localRoleId} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4">
        <Logo forceWhiteLabel={orgPlanTier === 'enterprise'} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <AnimatePresence mode="wait">
          {phase === 'details' && <DetailsForm key="details" />}
          {phase === 'overview' && <InterviewOverview key="overview" />}
          {phase === 'hardware' &&
            (interviewMode === 'internal' ? (
              <QuickDeviceSetup key="quick-hardware" />
            ) : (
              <HardwareCheck key="hardware" />
            ))}

          {phase === 'complete' && <InterviewComplete key="complete" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
