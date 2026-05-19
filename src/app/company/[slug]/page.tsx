import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, Globe, Users, Briefcase, Calendar } from 'lucide-react';

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).single();
  if (!org) notFound();

  const { data: jobs } = await supabase.from('roles').select('id, title, location, salary, job_type, created_at')
    .eq('org_id', org.id).eq('is_published', true).order('created_at', { ascending: false }).limit(10);

  return (
    <div className="min-h-screen bg-background">
      {/* Cover */}
      <div className="h-48 bg-gradient-to-r from-primary/20 to-primary/5 relative">
        {org.cover_url && <img src={org.cover_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10">
        {/* Header */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm mb-6">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl bg-background border border-border flex items-center justify-center overflow-hidden shrink-0">
              {org.logo_url ? <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" /> : <Building2 className="h-10 w-10 text-muted" />}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
              {org.industry && <p className="text-sm text-muted mt-1">{org.industry}</p>}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted">
                {org.headquarters && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{org.headquarters}</span>}
                {org.company_size && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{org.company_size} employees</span>}
                {org.website && <a href={org.website} target="_blank" rel="noopener" className="flex items-center gap-1 text-primary hover:underline"><Globe className="h-3.5 w-3.5" />{org.website}</a>}
                {org.founded_year && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Founded {org.founded_year}</span>}
              </div>
            </div>
          </div>
          {org.description && <p className="text-sm text-muted mt-4 leading-relaxed">{org.description}</p>}
        </div>

        {/* Jobs */}
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />Open Positions ({jobs?.length || 0})
          </h2>
          {(!jobs || jobs.length === 0) ? (
            <p className="text-sm text-muted text-center py-8">No open positions at the moment.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job: any) => (
                <Link key={job.id} href={`/career-fair/${job.id}`}
                  className="block p-4 rounded-xl border border-border/50 hover:border-primary/30 transition-colors">
                  <p className="text-sm font-semibold text-foreground">{job.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    {job.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
                    {job.job_type && <span>{job.job_type}</span>}
                    {job.salary && <span>{job.salary}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
