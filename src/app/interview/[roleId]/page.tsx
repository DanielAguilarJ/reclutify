'use client';

import { use } from 'react';
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Logo from '@/components/ui/Logo';
import DetailsForm from '@/components/candidate/DetailsForm';
import InterviewOverview from '@/components/candidate/InterviewOverview';
import HardwareCheck from '@/components/candidate/HardwareCheck';
import InterviewRoom from '@/components/candidate/InterviewRoom';
import InterviewComplete from '@/components/candidate/InterviewComplete';
import { useInterviewStore } from '@/store/interviewStore';
import { useAdminStore } from '@/store/adminStore';
import { ShieldX } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function CandidateInterview({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = use(params);
  const { roles } = useAdminStore();
  const role = roles.find((r) => r.id === roleId);
  const { phase, topics, setTopics } = useInterviewStore();
  const { language } = useAppStore();
  const es = language === 'es';

  // Set topics based on the selected role
  useEffect(() => {
    if (role && role.topics) {
      setTopics(role.topics);
    }
  }, [role, setTopics]);

  // Block direct access — only ticket-based access allowed
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-10 max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-5">
          <ShieldX className="h-8 w-8 text-danger" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {es ? 'Acceso Restringido' : 'Access Restricted'}
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          {es
            ? 'Las entrevistas solo son accesibles mediante un link único proporcionado por el equipo de recursos humanos. Contacta a tu reclutador para obtener tu link de entrevista.'
            : 'Interviews are only accessible through a unique link provided by the HR team. Contact your recruiter to get your interview link.'}
        </p>
      </div>
    </div>
  );
}
