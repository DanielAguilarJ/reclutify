'use client';

import { use, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Logo from '@/components/ui/Logo';
import DetailsForm from '@/components/candidate/DetailsForm';
import InterviewOverview from '@/components/candidate/InterviewOverview';

import HardwareCheck from '@/components/candidate/HardwareCheck';
import InterviewRoom from '@/components/candidate/InterviewRoom';
import InterviewComplete from '@/components/candidate/InterviewComplete';
import { useInterviewStore } from '@/store/interviewStore';
import { useAdminStore } from '@/store/adminStore';
import { useTicketStore } from '@/store/ticketStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import { ShieldX, Clock, CheckCircle2 } from 'lucide-react';

type TicketStatus = 'loading' | 'valid' | 'invalid' | 'used' | 'expired';

export default function TicketInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { getTicketByToken, markTicketUsed } = useTicketStore();
  const { roles } = useAdminStore();
  const { phase, setTopics, setCandidate, setPhase, setRoleId } = useInterviewStore();
  const { language, setLanguage, planTier } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('loading');
  const [localRoleId, setLocalRoleId] = useState('');
  const [candidateName, setCandidateName] = useState('');

  useEffect(() => {
    // Wait for Zustand hydration to finish before checking
    const checkTicket = () => {
      // Check for encoded fallback data in URL (cross-device MVP trick)
      const params = new URLSearchParams(window.location.search);
      const d = params.get('d');
      if (d) {
        try {
          const decoded = decodeURIComponent(escape(atob(d)));
          const payload = JSON.parse(decoded);
          if (payload.t && payload.r) {
            const currentTickets = useTicketStore.getState().tickets;
            const currentRoles = useAdminStore.getState().roles;
            
            if (!currentTickets.find((t) => t.token === token)) {
              useTicketStore.setState({ tickets: [payload.t, ...currentTickets] });
            }
            if (!currentRoles.find((r) => r.id === payload.r.id)) {
              useAdminStore.setState({ roles: [payload.r, ...currentRoles] });
            }
          }
        } catch (e) {
          console.error('Failed to decode fallback payload');
        }
      }

      // Always get fresh state, bypassing potential React closure staleness
      const currentTicket = useTicketStore.getState().tickets.find((t) => t.token === token);
      const currentRoles = useAdminStore.getState().roles;

      if (!currentTicket) {
        setTicketStatus('invalid');
        return;
      }

      if (currentTicket.used) {
        setTicketStatus('used');
        return;
      }

      if (Date.now() > currentTicket.expiresAt) {
        setTicketStatus('expired');
        return;
      }

      // Valid ticket — set up the interview
      const role = currentRoles.find((r) => r.id === currentTicket.roleId);
      if (role) {
        setTopics(role.topics);
        setLocalRoleId(role.id);
        setRoleId(role.id);  // Store in interview store for InterviewComplete
        setCandidateName(currentTicket.candidateName);

        // Set app language from ticket
        setLanguage(currentTicket.language);

        // Pre-fill candidate info
        setCandidate({
          name: currentTicket.candidateName,
          email: '',
          phone: '',
        });

        // Mark as used immediately so it can't be opened again
        markTicketUsed(token);

        // Start at the details form so candidate can enter their email and phone
        setPhase('details');
        setTicketStatus('valid');
      } else {
        setTicketStatus('invalid');
      }
    };

    // Hydration delay
    setTimeout(checkTicket, 100);
  }, [token]);

  // Error screens
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

  // Valid ticket — show interview flow
  if (phase === 'interview') {
    return <InterviewRoom roleId={localRoleId} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4">
        <Logo forceWhiteLabel={planTier === 'enterprise'} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <AnimatePresence mode="wait">
          {phase === 'details' && <DetailsForm key="details" />}
          {phase === 'overview' && <InterviewOverview key="overview" />}
          {phase === 'hardware' && <HardwareCheck key="hardware" />}

          {phase === 'complete' && <InterviewComplete key="complete" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
