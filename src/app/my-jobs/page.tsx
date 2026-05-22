'use client';

import { useState, useEffect } from 'react';
import {
  Bookmark,
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Trash2,
  FileSearch,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import AppNavbar from '@/components/ui/AppNavbar';
import Link from 'next/link';

interface SavedJob {
  id: string;
  role_id: string;
  created_at: string;
  title: string;
  location: string | null;
  salary: string | null;
  job_type: string | null;
}

interface Application {
  id: string;
  role_id: string;
  role_title: string;
  org_name: string | null;
  status: string;
  applied_at: string;
}

export default function MyJobsPage() {
  const { language } = useAppStore();
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  const [tab, setTab] = useState<'saved' | 'applications'>('saved');
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch saved jobs
    try {
      const { data: saved } = await supabase
        .from('saved_jobs')
        .select('id, role_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (saved && saved.length > 0) {
        const ids = saved.map((s) => s.role_id);
        const { data: roles } = await supabase
          .from('roles')
          .select('id, title, location, salary, job_type')
          .in('id', ids);

        if (roles) {
          const merged: SavedJob[] = saved.map((s) => {
            const role = roles.find((r) => r.id === s.role_id);
            return {
              id: s.id,
              role_id: s.role_id,
              created_at: s.created_at,
              title: role?.title || t('Unknown Job', 'Empleo desconocido'),
              location: role?.location || null,
              salary: role?.salary || null,
              job_type: role?.job_type || null,
            };
          });
          setSavedJobs(merged);
        }
      }
    } catch {
      setSavedJobs([]);
    }

    // Fetch applications
    try {
      const { data: apps } = await supabase
        .from('job_applications')
        .select('id, role_id, role_title, org_name, status, applied_at')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false });

      setApplications((apps as Application[]) || []);
    } catch {
      // Table might not exist, try alternate table
      try {
        const { data: invites } = await supabase
          .from('candidate_invites')
          .select('id, role_id, status, created_at')
          .eq('candidate_id', user.id)
          .order('created_at', { ascending: false });

        if (invites) {
          const mapped: Application[] = invites.map((inv) => ({
            id: inv.id,
            role_id: inv.role_id,
            role_title: '',
            org_name: null,
            status: inv.status || 'pending',
            applied_at: inv.created_at,
          }));
          setApplications(mapped);
        }
      } catch {
        setApplications([]);
      }
    }

    setLoading(false);
  };

  const handleUnsave = async (savedJobId: string, roleId: string) => {
    setRemovingId(savedJobId);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('saved_jobs')
        .delete()
        .eq('id', savedJobId)
        .eq('user_id', user.id);

      setSavedJobs((prev) => prev.filter((j) => j.id !== savedJobId));
    }
    setRemovingId(null);
  };

  const statusIcon = (status: string) => {
    if (status === 'offered' || status === 'accepted') {
      return <CheckCircle className="h-4 w-4 text-success" />;
    }
    if (status === 'rejected') {
      return <XCircle className="h-4 w-4 text-danger" />;
    }
    return <Clock className="h-4 w-4 text-warning" />;
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, { en: string; es: string }> = {
      pending: { en: 'Pending', es: 'Pendiente' },
      reviewing: { en: 'Reviewing', es: 'En revision' },
      offered: { en: 'Offered', es: 'Ofrecido' },
      accepted: { en: 'Accepted', es: 'Aceptado' },
      rejected: { en: 'Rejected', es: 'Rechazado' },
    };
    const label = labels[status];
    if (label) return t(label.en, label.es);
    return status.replace('_', ' ');
  };

  const statusColor = (status: string) => {
    if (status === 'offered' || status === 'accepted') return 'bg-success/10 text-success';
    if (status === 'rejected') return 'bg-danger/10 text-danger';
    return 'bg-warning/10 text-warning';
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const SkeletonCard = () => (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-surface" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-40 bg-surface rounded" />
        <div className="h-3 w-24 bg-surface rounded" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar activeRoute="/my-jobs" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {t('My Jobs', 'Mis Empleos')}
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('saved')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'saved'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            <Bookmark className="h-4 w-4" />
            {t('Saved Jobs', 'Guardados')} ({savedJobs.length})
          </button>
          <button
            onClick={() => setTab('applications')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'applications'
                ? 'bg-primary text-white'
                : 'bg-card border border-border text-muted hover:text-foreground'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            {t('My Applications', 'Mis Aplicaciones')} ({applications.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : tab === 'saved' ? (
          <div className="space-y-3">
            {savedJobs.length === 0 ? (
              <div className="text-center py-12">
                <Bookmark className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('No saved jobs yet', 'No tienes empleos guardados')}
                </p>
                <p className="text-muted/60 text-xs mt-1">
                  {t(
                    'Save jobs from the career fair to review later',
                    'Guarda empleos de la feria laboral para revisarlos despues'
                  )}
                </p>
                <Link
                  href="/career-fair"
                  className="inline-block mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  {t('Browse Jobs', 'Explorar Empleos')}
                </Link>
              </div>
            ) : (
              savedJobs.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <Link href={`/career-fair/${j.role_id}`} className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{j.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted mt-0.5 flex-wrap">
                      {j.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {j.location}
                        </span>
                      )}
                      {j.job_type && (
                        <span className="bg-surface px-2 py-0.5 rounded-full">{j.job_type}</span>
                      )}
                      {j.salary && <span>{j.salary}</span>}
                      <span className="text-muted/60">
                        {t('Saved', 'Guardado')} {formatDate(j.created_at)}
                      </span>
                    </div>
                  </Link>
                  <button
                    onClick={() => handleUnsave(j.id, j.role_id)}
                    disabled={removingId === j.id}
                    className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0 disabled:opacity-50"
                    title={t('Remove from saved', 'Quitar de guardados')}
                  >
                    {removingId === j.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {applications.length === 0 ? (
              <div className="text-center py-12">
                <FileSearch className="h-12 w-12 text-muted/30 mx-auto mb-3" />
                <p className="text-muted text-sm">
                  {t('No applications yet', 'No has aplicado a ningun empleo')}
                </p>
                <p className="text-muted/60 text-xs mt-1">
                  {t(
                    'Apply to jobs and track your progress here',
                    'Aplica a empleos y sigue tu progreso aqui'
                  )}
                </p>
                <Link
                  href="/career-fair"
                  className="inline-block mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  {t('Find Jobs', 'Buscar Empleos')}
                </Link>
              </div>
            ) : (
              applications.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50"
                >
                  <div className="shrink-0">{statusIcon(a.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {a.role_title || t('Job Application', 'Aplicacion')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                      {a.org_name && <span>{a.org_name}</span>}
                      <span>{t('Applied', 'Aplicado')} {formatDate(a.applied_at)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${statusColor(a.status)}`}
                  >
                    {statusLabel(a.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
