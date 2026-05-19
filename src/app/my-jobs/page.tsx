'use client';
import { useState, useEffect } from 'react';
import { Bookmark, Briefcase, Clock, CheckCircle, XCircle, MapPin } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function MyJobsPage() {
  const { language } = useAppStore();
  const [tab, setTab] = useState<'saved' | 'applications'>('saved');
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    // Saved jobs
    const { data: saved } = await supabase.from('saved_jobs').select('role_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
    if (saved && saved.length > 0) {
      const ids = saved.map((s: any) => s.role_id);
      const { data: roles } = await supabase.from('roles').select('id, title, location, salary, job_type').in('id', ids);
      setSavedJobs(roles || []);
    }
    // Applications
    const { data: apps } = await supabase.from('job_applications').select('*').eq('user_id', user.id).order('applied_at', { ascending: false });
    setApplications(apps || []);
    setLoading(false);
  };

  const statusIcon = (s: string) => {
    if (s === 'offered') return <CheckCircle className="h-4 w-4 text-success" />;
    if (s === 'rejected') return <XCircle className="h-4 w-4 text-danger" />;
    return <Clock className="h-4 w-4 text-warning" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">{language === 'es' ? 'Mis Empleos' : 'My Jobs'}</h1>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('saved')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'saved' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
            <Bookmark className="h-4 w-4" />{language === 'es' ? 'Guardados' : 'Saved'} ({savedJobs.length})
          </button>
          <button onClick={() => setTab('applications')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'applications' ? 'bg-primary text-white' : 'bg-card border border-border text-muted'}`}>
            <Briefcase className="h-4 w-4" />{language === 'es' ? 'Aplicaciones' : 'Applications'} ({applications.length})
          </button>
        </div>

        {loading ? <div className="text-center py-12"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" /></div> : tab === 'saved' ? (
          <div className="space-y-3">
            {savedJobs.length === 0 ? <p className="text-center text-muted py-8">{language === 'es' ? 'No tienes empleos guardados' : 'No saved jobs'}</p> : savedJobs.map((j) => (
              <Link key={j.id} href={`/career-fair/${j.id}`} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors">
                <Briefcase className="h-8 w-8 text-primary/50" />
                <div className="flex-1"><p className="text-sm font-semibold text-foreground">{j.title}</p><div className="flex gap-3 text-xs text-muted mt-0.5">{j.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location}</span>}{j.salary && <span>{j.salary}</span>}</div></div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {applications.length === 0 ? <p className="text-center text-muted py-8">{language === 'es' ? 'No has aplicado a ningun empleo' : 'No applications yet'}</p> : applications.map((a) => (
              <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50">
                {statusIcon(a.status)}
                <div className="flex-1"><p className="text-sm font-semibold text-foreground">{a.role_title}</p>{a.org_name && <p className="text-xs text-muted">{a.org_name}</p>}</div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${a.status === 'offered' ? 'bg-success/10 text-success' : a.status === 'rejected' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>{a.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
