'use client';

import { useMemo } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { useRoles } from '@/hooks/useRoles';
import { useCandidates } from '@/hooks/useCandidates';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { Users, CheckCircle2, Clock, Briefcase, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

const COLORS = ['#10B981', '#F59E0B', '#EF4444'];
const PIE_COLORS = {
  'Aprobado': '#10B981',
  'En revisión': '#F59E0B',
  'No recomendado': '#EF4444',
  'Strong Hire': '#10B981',
  'Hire': '#10B981',  
  'Pass': '#EF4444'
};

export default function AdminDashboardPage() {
  const { candidates, roles } = useAdminStore();
  const { language } = useAppStore();

  // Sincronizar datos con Supabase al montar el componente
  useRoles();
  useCandidates();

  const metrics = useMemo(() => {
    const totalCandidates = candidates.length;

    // Aprobación (Aprobados vs Total evaluados)
    const evaluated = candidates.filter(c => c.evaluation);
    const approved = evaluated.filter(c => c.evaluation?.recommendation === 'Strong Hire' || c.evaluation?.recommendation === 'Hire');
    const approvalRate = evaluated.length > 0 ? (approved.length / evaluated.length) * 100 : 0;

    // Tiempo promedio (se asumen 15 minutos si no hay métrica duration)
    const totalTime = evaluated.reduce((acc, curr) => acc + (curr.duration || 15), 0);
    const avgTime = evaluated.length > 0 ? totalTime / evaluated.length : 0;

    return {
      totalCandidates,
      approvalRate: approvalRate.toFixed(1),
      avgTime: Math.round(avgTime),
      activeRoles: roles.length
    };
  }, [candidates, roles]);

  const trendsData = useMemo(() => {
    // Ultimos 30 días simulados o reales. Agrupamos por fecha
    const grouped = candidates.reduce((acc, c) => {
      const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([date, count]) => ({ date, count })).slice(-30);
  }, [candidates]);

  const roleDistribution = useMemo(() => {
    const grouped = candidates.reduce((acc, c) => {
      acc[c.roleTitle] = (acc[c.roleTitle] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [candidates]);

  const resultsDistribution = useMemo(() => {
    const evaluated = candidates.filter(c => c.evaluation);
    const strongHire = evaluated.filter(c => c.evaluation?.recommendation === 'Strong Hire').length;
    const hire = evaluated.filter(c => c.evaluation?.recommendation === 'Hire').length;
    const pass = evaluated.filter(c => c.evaluation?.recommendation === 'Pass').length;

    return [
      { name: language === 'es' ? 'Aprobado' : 'Approved', value: strongHire + hire },
      { name: language === 'es' ? 'No recomendado' : 'Not Recommended', value: pass }
    ];
  }, [candidates, language]);

  const recentCandidates = candidates
    .filter(c => c.status === 'completed')
    .slice(0, 10);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {language === 'es' ? 'Panel de Control' : 'Dashboard Analytics'}
        </h1>
        <p className="text-sm text-muted">
          {language === 'es' ? 'Resumen de actividad y evaluación con IA.' : 'Activity summary and AI evaluations.'}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted mb-1">{language === 'es' ? 'Candidatos Totales' : 'Total Candidates'}</p>
          <h3 className="text-2xl font-semibold text-foreground">{metrics.totalCandidates}</h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 rounded-xl bg-success/10 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted mb-1">{language === 'es' ? 'Tasa de Aprobación' : 'Approval Rate'}</p>
          <h3 className="text-2xl font-semibold text-foreground">{metrics.approvalRate}%</h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 rounded-xl bg-warning/10 text-warning">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted mb-1">{language === 'es' ? 'Tiempo Promedio' : 'Avg Interview Time'}</p>
          <h3 className="text-2xl font-semibold text-foreground">{metrics.avgTime} min</h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 rounded-xl bg-info/10 text-[#0EA5E9]">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted mb-1">{language === 'es' ? 'Vacantes Activas' : 'Active Roles'}</p>
          <h3 className="text-2xl font-semibold text-foreground">{metrics.activeRoles}</h3>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {language === 'es' ? 'Candidatos por Día' : 'Candidates by Day'}
          </h3>
          <div className="h-[250px]">
            {trendsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendsData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm border-2 border-dashed border-border/30 rounded-xl">
                {language === 'es' ? 'No hay datos suficientes' : 'Not enough data'}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {language === 'es' ? 'Distribución de Resultados' : 'Results Distribution'}
          </h3>
          <div className="h-[250px]">
            {resultsDistribution.some(r => r.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resultsDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {resultsDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm border-2 border-dashed border-border/30 rounded-xl">
                {language === 'es' ? 'No hay evaluaciones' : 'No evaluations yet'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Roles */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {language === 'es' ? 'Top Vacantes (Candidatos)' : 'Top Roles (Candidates)'}
        </h3>
        <div className="h-[250px]">
          {roleDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleDistribution} layout="vertical" margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="value" fill="#d3fb52" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
             <div className="h-full flex items-center justify-center text-muted text-sm border-2 border-dashed border-border/30 rounded-xl">
                {language === 'es' ? 'No hay vacantes activas' : 'No roles active'}
             </div>
          )}
        </div>
      </div>

      {/* Table Recents */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <div className="p-5 border-b border-border/50 flex justify-between items-center">
           <h3 className="text-sm font-semibold text-foreground">
             {language === 'es' ? 'Actividad Reciente' : 'Recent Activity'}
           </h3>
           <Link href="/admin/pipeline" className="text-xs text-primary hover:text-primary-hover font-medium">
             {language === 'es' ? 'Ver todo' : 'View all'} &rarr;
           </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-medium text-muted uppercase">
                <th className="px-6 py-4">{language === 'es' ? 'Candidato' : 'Candidate'}</th>
                <th className="px-6 py-4">{language === 'es' ? 'Vacante' : 'Role'}</th>
                <th className="px-6 py-4">{language === 'es' ? 'Score' : 'Score'}</th>
                <th className="px-6 py-4">{language === 'es' ? 'Estado' : 'Status'}</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {recentCandidates.length > 0 ? recentCandidates.map((c, i) => (
                <tr key={c.id || i} className="hover:bg-background/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center text-primary text-xs font-bold">
                        {c.candidate.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{c.candidate.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{c.roleTitle}</td>
                  <td className="px-6 py-4 font-semibold text-foreground text-sm">
                    {c.evaluation?.overallScore ? `${c.evaluation.overallScore}/100` : '--'}
                  </td>
                  <td className="px-6 py-4">
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
                       <CheckCircle2 className="h-3 w-3" />
                       {language === 'es' ? 'Completado' : 'Completed'}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {c.evaluation && (
                      <Link
                        href={`/admin/report/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
                      >
                        {language === 'es' ? 'Ver Reporte' : 'View Report'}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted">
                     {language === 'es' ? 'No hay actividad completada.' : 'No completed activity.'}
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
