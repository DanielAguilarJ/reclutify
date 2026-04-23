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
import { createClient } from '@/utils/supabase/client';
import { ShieldX, Clock, CheckCircle2 } from 'lucide-react';

import type { Role, Topic } from '@/types';
import type { InterviewTicket } from '@/types';

type TicketStatus = 'loading' | 'valid' | 'invalid' | 'used' | 'expired';

export default function TicketInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { getTicketByToken, markTicketUsed, fetchTicketByToken, syncMarkUsed } = useTicketStore();
  const { roles } = useAdminStore();
  const { phase, setTopics, setCandidate, setPhase, setRoleId } = useInterviewStore();
  const { language, setLanguage, planTier } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('loading');
  const [localRoleId, setLocalRoleId] = useState('');
  const [candidateName, setCandidateName] = useState('');

  useEffect(() => {
    const checkTicket = async () => {
      // 1. Primero intentar encontrar el ticket en el store local (caché)
      let currentTicket = getTicketByToken(token);
      let role: Role | undefined;

      // 2. Si no está en local, buscar en Supabase directamente
      if (!currentTicket) {
        const supabaseTicket = await fetchTicketByToken(token);
        if (supabaseTicket) {
          currentTicket = supabaseTicket;
        }
      }

      // 3. Fallback: intentar decodificar datos del URL (compatibilidad hacia atrás)
      if (!currentTicket) {
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
              if (!currentRoles.find((r: Role) => r.id === payload.r.id)) {
                useAdminStore.setState({ roles: [payload.r, ...currentRoles] });
              }
              currentTicket = payload.t as InterviewTicket;
            }
          } catch (e) {
            console.error('Failed to decode fallback payload');
          }
        }
      }

      // Verificar estado del ticket
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

      // Buscar el rol — primero en store local, luego en Supabase
      role = useAdminStore.getState().roles.find((r) => r.id === currentTicket!.roleId);
      
      if (!role) {
        // Intentar cargar el rol directamente desde Supabase
        try {
          const supabase = createClient();
          const { data: roleData } = await supabase
            .from('roles')
            .select('*')
            .eq('id', currentTicket.roleId)
            .single();

          if (roleData) {
            role = {
              id: roleData.id,
              title: roleData.title,
              description: roleData.description || undefined,
              location: roleData.location || undefined,
              salary: roleData.salary || undefined,
              jobType: roleData.job_type || undefined,
              topics: roleData.topics || [],
              createdAt: new Date(roleData.created_at).getTime(),
            };
            // Agregar al store local para uso futuro
            const currentRoles = useAdminStore.getState().roles;
            if (!currentRoles.find((r) => r.id === role!.id)) {
              useAdminStore.setState({ roles: [role!, ...currentRoles] });
            }
          }
        } catch (err) {
          console.error('Error cargando rol desde Supabase:', err);
        }
      }

      if (role) {
        setTopics(role.topics);
        setLocalRoleId(role.id);
        setRoleId(role.id);
        setCandidateName(currentTicket.candidateName);

        // Setear idioma desde el ticket
        setLanguage(currentTicket.language);

        // Pre-llenar info del candidato
        setCandidate({
          name: currentTicket.candidateName,
          email: '',
          phone: '',
        });

        // Marcar como usado localmente e inmediatamente en Supabase
        markTicketUsed(token);
        syncMarkUsed(token);

        // Iniciar en el formulario de detalles
        setPhase('details');
        setTicketStatus('valid');
      } else {
        setTicketStatus('invalid');
      }
    };

    // Pequeño delay para hidratación de Zustand
    setTimeout(checkTicket, 100);
  }, [token]);

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
