'use client';

import { useMemo } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { ShieldAlert, Info, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BiasAnalyticsPage() {
  const { candidates } = useAdminStore();
  const { language } = useAppStore();
  const es = language === 'es';

  const evaluated = useMemo(() => candidates.filter(c => c.evaluation), [candidates]);

  const scoreByRole = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    evaluated.forEach(c => {
      if (!map[c.roleTitle]) map[c.roleTitle] = { total: 0, count: 0 };
      map[c.roleTitle].total += c.evaluation!.overallScore;
      map[c.roleTitle].count += 1;
    });
    return Object.entries(map).map(([role, data]) => ({
      role,
      avgScore: Math.round(data.total / data.count)
    }));
  }, [evaluated]);

  const flagsFound = useMemo(() => {
    let count = 0;
    evaluated.forEach(c => {
      if (c.evaluation?.biasFlags && c.evaluation.biasFlags.length > 0) count++;
    });
    return count;
  }, [evaluated]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-1 flex items-center gap-2">
          {es ? 'Análisis de Equidad y Sesgos' : 'Fairness & Bias Analytics'}
        </h1>
        <p className="text-sm text-muted">
          {es 
            ? 'Monitorea la imparcialidad de Zara. Detecta anomalías en las puntuaciones y mantén un proceso ético.'
            : 'Monitor Zara\'s impartiality. Detect scoring anomalies and maintain an ethical process.'}
        </p>
      </div>

      <div className="bg-info/10 border border-[#0ea5e9]/20 rounded-2xl p-5 flex items-start gap-4">
        <Info className="h-5 w-5 text-[#0ea5e9] mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {es ? 'Datos Demográficos Incompletos' : 'Incomplete Demographic Data'}
          </h3>
          <p className="text-xs text-muted leading-relaxed">
            {es 
              ? 'Para un análisis de equidad completo (por género, origen, etc.), ve a Configuración y habilita la recolección opcional de datos demográficos en el portal de candidatos. Actualmente solo mostramos métricas inferidas por la IA y distribuciones por vacante.'
              : 'For full equity analysis (by gender, origin, etc.), go to Settings and enable optional demographic data collection. We currently only show metrics inferred by AI and role distributions.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
             <div className={`p-2 rounded-xl ${flagsFound > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
               {flagsFound > 0 ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
             </div>
          </div>
          <p className="text-sm text-muted mb-1">{es ? 'Alertas de Sesgo IA' : 'AI Bias Flags'}</p>
          <h3 className="text-2xl font-semibold text-foreground">
            {flagsFound} <span className="text-sm font-normal text-muted">/ {evaluated.length}</span>
          </h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between md:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
             {es ? 'Puntuación Promedio por Vacante' : 'Average Score by Role'}
          </h3>
          <div className="h-[150px]">
            {scoreByRole.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={scoreByRole} layout="vertical" margin={{ left: 10, right: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                   <XAxis type="number" domain={[0, 100]} fontSize={11} stroke="#888" />
                   <YAxis dataKey="role" type="category" width={120} fontSize={10} stroke="#888" />
                   <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', borderRadius: '8px', border: '1px solid #333' }} />
                   <Bar dataKey="avgScore" fill="#3b4cca" radius={[0, 4, 4, 0]} />
                 </BarChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-muted text-sm border border-dashed border-border/30 rounded-xl">
                 {es ? 'No hay datos' : 'No data'}
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
