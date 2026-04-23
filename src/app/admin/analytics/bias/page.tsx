'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { ShieldAlert, Info, TrendingDown, AlertTriangle, ShieldCheck, Users, Clock, Zap } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function BiasAnalyticsPage() {
  const { candidates, roles } = useAdminStore();
  const { language } = useAppStore();
  const es = language === 'es';

  const [primaryColor, setPrimaryColor] = useState('#d3fb52');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (color) setPrimaryColor(color);
    }
  }, []);

  const evaluated = useMemo(() => candidates.filter(c => c.evaluation), [candidates]);

  const allFlags = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flags: Array<{ flag: any, candidateName: string, roleTitle: string, date: number }> = [];
    evaluated.forEach(c => {
      if (c.evaluation?.biasFlags) {
        c.evaluation.biasFlags.forEach(f => {
          flags.push({ flag: f, candidateName: c.candidate.name, roleTitle: c.roleTitle, date: c.date });
        });
      }
    });
    return flags.sort((a, b) => b.date - a.date);
  }, [evaluated]);

  const flagsCount = allFlags.length;
  const candidatesWithFlags = evaluated.filter(c => c.evaluation?.biasFlags?.length).length;
  const flagsPercentage = evaluated.length ? Math.round((candidatesWithFlags / evaluated.length) * 100) : 0;

  const topicStats = useMemo(() => {
    const stats: Record<string, { sum: number, count: number, scores: number[] }> = {};
    evaluated.forEach(c => {
      if (c.evaluation?.topicScores) {
        Object.entries(c.evaluation.topicScores).forEach(([topic, score]) => {
          if (!stats[topic]) stats[topic] = { sum: 0, count: 0, scores: [] };
          stats[topic].sum += score;
          stats[topic].count += 1;
          stats[topic].scores.push(score);
        });
      }
    });
    return Object.entries(stats).map(([topic, data]) => {
      const avg = data.sum / data.count;
      const variance = data.scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.count;
      return { topic, avg: Number(avg.toFixed(1)), variance: Number(variance.toFixed(2)), count: data.count };
    }).sort((a, b) => a.avg - b.avg);
  }, [evaluated]);

  const lowestTopic = topicStats[0];

  const mostEvaluatedRole = useMemo(() => {
    const counts: Record<string, number> = {};
    evaluated.forEach(c => {
      counts[c.roleTitle] = (counts[c.roleTitle] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { role: sorted[0][0], count: sorted[0][1] } : null;
  }, [evaluated]);

  const biasByType = useMemo(() => {
    const types = ['linguistic_bias', 'gender_bias', 'cultural_bias', 'age_bias'];
    const result: Record<string, { total: number, high: number, medium: number, low: number }> = {};
    types.forEach(t => result[t] = { total: 0, high: 0, medium: 0, low: 0 });
    allFlags.forEach(({ flag }) => {
      if (result[flag.type]) {
        result[flag.type].total++;
        result[flag.type][flag.severity]++;
      }
    });
    return result;
  }, [allFlags]);

  const recByRole = useMemo(() => {
    const map: Record<string, { role: string, 'Strong Hire': number, 'Hire': number, 'Pass': number }> = {};
    evaluated.forEach(c => {
      if (!map[c.roleTitle]) map[c.roleTitle] = { role: c.roleTitle, 'Strong Hire': 0, 'Hire': 0, 'Pass': 0 };
      const rec = c.evaluation?.recommendation;
      if (rec === 'Strong Hire' || rec === 'Hire' || rec === 'Pass') {
        map[c.roleTitle][rec]++;
      }
    });
    return Object.values(map);
  }, [evaluated]);

  const temporalTrend = useMemo(() => {
    const weeks: Record<string, { total: number, withBias: number, timestamp: number }> = {};
    evaluated.forEach(c => {
      const d = new Date(c.date);
      d.setDate(d.getDate() - d.getDay()); 
      const weekKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!weeks[weekKey]) weeks[weekKey] = { total: 0, withBias: 0, timestamp: d.getTime() };
      weeks[weekKey].total++;
      if (c.evaluation?.biasFlags && c.evaluation.biasFlags.length > 0) {
        weeks[weekKey].withBias++;
      }
    });
    return Object.entries(weeks)
      .map(([week, data]) => ({
        week,
        biasPct: Math.round((data.withBias / data.total) * 100),
        timestamp: data.timestamp
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-6); 
  }, [evaluated]);

  const durationCorrelation = useMemo(() => {
    const groups: Record<number, { sum: number, count: number, scores: number[] }> = {};
    evaluated.forEach(c => {
      const role = roles.find(r => r.id === c.roleId);
      const duration = role?.interviewDuration || 30; 
      if (!groups[duration]) groups[duration] = { sum: 0, count: 0, scores: [] };
      const score = c.evaluation?.overallScore || 0;
      groups[duration].sum += score;
      groups[duration].count++;
      groups[duration].scores.push(score);
    });
    return Object.entries(groups).map(([dur, data]) => {
      const avg = data.sum / data.count;
      const variance = data.scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.count;
      return {
        duration: `${dur} min`,
        avgScore: Math.round(avg),
        variance: Number(variance.toFixed(2)),
        count: data.count
      };
    }).sort((a, b) => parseInt(a.duration) - parseInt(b.duration));
  }, [evaluated, roles]);

  const severityColor = (severity: string) => {
    switch(severity) {
      case 'high': return 'bg-danger/10 text-danger border-danger/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'low': return 'bg-success/10 text-success border-success/20';
      default: return 'bg-border/50 text-muted';
    }
  };

  const getBiasLabel = (type: string) => {
    const labels: Record<string, Record<string, string>> = {
      linguistic_bias: { es: 'Sesgo Lingüístico', en: 'Linguistic Bias' },
      gender_bias: { es: 'Sesgo de Género', en: 'Gender Bias' },
      cultural_bias: { es: 'Sesgo Cultural', en: 'Cultural Bias' },
      age_bias: { es: 'Sesgo de Edad', en: 'Age Bias' },
    };
    return labels[type]?.[es ? 'es' : 'en'] || type;
  };

  if (evaluated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div className="h-16 w-16 bg-primary/10 text-primary flex items-center justify-center rounded-full mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {es ? 'No hay evaluaciones completadas' : 'No completed evaluations'}
        </h2>
        <p className="text-muted max-w-md">
          {es 
            ? 'Los datos de equidad y sesgos aparecerán aquí cuando los candidatos comiencen a completar sus entrevistas.' 
            : 'Fairness and bias data will appear here once candidates start completing their interviews.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto pb-12">
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
        <Info className="h-5 w-5 text-[#0ea5e9] mt-0.5 shrink-0" />
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
             <div className="p-2 rounded-xl bg-primary/10 text-primary">
               <Users className="h-5 w-5" />
             </div>
          </div>
          <p className="text-sm text-muted mb-1">{es ? 'Total Evaluados' : 'Total Evaluated'}</p>
          <h3 className="text-2xl font-semibold text-foreground">{evaluated.length}</h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
             <div className={`p-2 rounded-xl ${flagsCount > 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
               {flagsCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
             </div>
          </div>
          <p className="text-sm text-muted mb-1">{es ? 'Alertas Detectadas' : 'Flags Detected'}</p>
          <h3 className="text-2xl font-semibold text-foreground">
            {flagsCount} <span className="text-sm font-normal text-muted">/ {evaluated.length} ({flagsPercentage}%)</span>
          </h3>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between mb-4">
             <div className="p-2 rounded-xl bg-warning/10 text-warning">
               <TrendingDown className="h-5 w-5" />
             </div>
          </div>
          <p className="text-sm text-muted mb-1">{es ? 'Tema más bajo' : 'Lowest Topic'}</p>
          <h3 className="text-xl font-semibold text-foreground truncate" title={lowestTopic ? lowestTopic.topic : ''}>
            {lowestTopic ? lowestTopic.topic : '--'}
          </h3>
          {lowestTopic && <span className="text-xs text-muted">Avg Score: {lowestTopic.avg}</span>}
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between mb-4">
             <div className="p-2 rounded-xl bg-info/10 text-[#0ea5e9]">
               <Zap className="h-5 w-5" />
             </div>
          </div>
          <p className="text-sm text-muted mb-1">{es ? 'Vacante más evaluada' : 'Most Evaluated Role'}</p>
          <h3 className="text-xl font-semibold text-foreground truncate" title={mostEvaluatedRole ? mostEvaluatedRole.role : ''}>
            {mostEvaluatedRole ? mostEvaluatedRole.role : '--'}
          </h3>
          {mostEvaluatedRole && <span className="text-xs text-muted">{mostEvaluatedRole.count} {es ? 'candidatos' : 'candidates'}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(biasByType).map(([type, data]) => (
          <div key={type} className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col">
            <h3 className="text-sm font-semibold text-foreground mb-4">{getBiasLabel(type)}</h3>
            <div className="text-3xl font-bold mb-4">{data.total}</div>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded-md bg-danger/10 text-danger border border-danger/20 font-medium">H: {data.high}</span>
              <span className="px-2 py-1 rounded-md bg-warning/10 text-warning border border-warning/20 font-medium">M: {data.medium}</span>
              <span className="px-2 py-1 rounded-md bg-success/10 text-success border border-success/20 font-medium">L: {data.low}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/50">
           <h3 className="text-sm font-semibold text-foreground">
             {es ? 'Registro de Alertas (Flags)' : 'Bias Flags Log'}
           </h3>
        </div>
        <div className="overflow-x-auto">
          {allFlags.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs font-medium text-muted uppercase">
                  <th className="px-5 py-3">{es ? 'Candidato' : 'Candidate'}</th>
                  <th className="px-5 py-3">{es ? 'Vacante' : 'Role'}</th>
                  <th className="px-5 py-3">{es ? 'Tipo' : 'Type'}</th>
                  <th className="px-5 py-3">{es ? 'Severidad' : 'Severity'}</th>
                  <th className="px-5 py-3">{es ? 'Descripción' : 'Description'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {allFlags.map((item, i) => (
                  <tr key={i} className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-foreground whitespace-nowrap">{item.candidateName}</td>
                    <td className="px-5 py-3 text-sm text-muted whitespace-nowrap">{item.roleTitle}</td>
                    <td className="px-5 py-3 text-sm whitespace-nowrap">
                      <span className="px-2 py-1 rounded-md bg-background border border-border/50 text-xs">
                        {getBiasLabel(item.flag.type)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${severityColor(item.flag.severity)} capitalize`}>
                        {item.flag.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted max-w-xs truncate" title={item.flag.description}>
                      {item.flag.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 bg-success/10 text-success flex items-center justify-center rounded-full mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-foreground font-medium">{es ? 'Todo en orden' : 'All clear'}</p>
              <p className="text-sm text-muted">{es ? 'No se han detectado sesgos en las entrevistas.' : 'No biases detected in interviews.'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">
             {es ? 'Recomendaciones por Vacante' : 'Recommendations by Role'}
          </h3>
          <div className="h-[250px]">
             {recByRole.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={recByRole} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                   <XAxis dataKey="role" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                   <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                   <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', borderRadius: '8px', border: '1px solid #333' }} />
                   <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                   <Bar dataKey="Strong Hire" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                   <Bar dataKey="Hire" stackId="a" fill={primaryColor} />
                   <Bar dataKey="Pass" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-muted text-sm border-2 border-dashed border-border/30 rounded-xl">
                 {es ? 'No hay datos' : 'No data'}
               </div>
             )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            {es ? 'Tendencia de Sesgos en el Tiempo' : 'Bias Trend Over Time'}
          </h3>
          <div className="h-[250px]">
            {temporalTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temporalTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="week" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#111', borderRadius: '8px', border: '1px solid #333' }} />
                  <Line type="monotone" name={es ? '% con Sesgo' : '% with Bias'} dataKey="biasPct" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted text-sm border-2 border-dashed border-border/30 rounded-xl">
                 {es ? 'No hay suficientes datos temporales' : 'Not enough temporal data'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50">
             <h3 className="text-sm font-semibold text-foreground">
               {es ? 'Consistencia por Tema' : 'Consistency by Topic'}
             </h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card shadow-sm">
                <tr className="border-b border-border/50 text-left text-xs font-medium text-muted uppercase">
                  <th className="px-5 py-3">{es ? 'Tema' : 'Topic'}</th>
                  <th className="px-5 py-3">{es ? 'Promedio' : 'Average'}</th>
                  <th className="px-5 py-3">{es ? 'Varianza' : 'Variance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {topicStats.map((t, i) => (
                  <tr key={i} className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                      {t.avg < 4.0 && <AlertTriangle className="h-4 w-4 text-warning" />}
                      <span className="truncate max-w-[200px]" title={t.topic}>{t.topic}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold text-foreground">{t.avg}</td>
                    <td className="px-5 py-3 text-sm text-muted">{t.variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50">
             <h3 className="text-sm font-semibold text-foreground">
               {es ? 'Duración vs Calidad de Evaluación' : 'Duration vs Evaluation Quality'}
             </h3>
             <p className="text-xs text-muted mt-1">
               {es ? 'Correlación entre tiempo de entrevista y varianza de puntajes.' : 'Correlation between interview time and score variance.'}
             </p>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[300px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card shadow-sm">
                <tr className="border-b border-border/50 text-left text-xs font-medium text-muted uppercase">
                  <th className="px-5 py-3">{es ? 'Duración' : 'Duration'}</th>
                  <th className="px-5 py-3">{es ? 'Entrevistas' : 'Interviews'}</th>
                  <th className="px-5 py-3">{es ? 'Score Promedio' : 'Avg Score'}</th>
                  <th className="px-5 py-3">{es ? 'Varianza' : 'Variance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {durationCorrelation.map((d, i) => (
                  <tr key={i} className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted" />
                      {d.duration}
                    </td>
                    <td className="px-5 py-3 text-sm text-muted">{d.count}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-foreground">{d.avgScore}</td>
                    <td className="px-5 py-3 text-sm text-muted">{d.variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
