'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ArrowUpDown } from 'lucide-react';
import type { CandidateResult } from '@/types';

interface CompareModalProps {
  candidates: CandidateResult[];
  onClose: () => void;
  language: 'en' | 'es';
}

export default function CompareModal({ candidates, onClose, language }: CompareModalProps) {
  const es = language === 'es';

  // Sort candidates by overallScore descending
  const sorted = [...candidates].sort(
    (a, b) => (b.evaluation?.overallScore || 0) - (a.evaluation?.overallScore || 0)
  );

  // Collect all unique topic names across all candidates
  const allTopics = new Set<string>();
  sorted.forEach(c => {
    if (c.evaluation?.topicScores) {
      Object.keys(c.evaluation.topicScores).forEach(t => allTopics.add(t));
    }
  });

  const getScoreColor = (score: number, max: number = 100) => {
    const pct = (score / max) * 100;
    if (pct >= 80) return 'text-success';
    if (pct >= 60) return 'text-warning';
    return 'text-danger';
  };

  const getRecStyles = (rec: string) => {
    switch (rec) {
      case 'Strong Hire':
        return 'bg-success/10 text-success border-success/20';
      case 'Hire':
        return 'bg-primary/10 text-primary border-primary/20';
      default:
        return 'bg-danger/10 text-danger border-danger/20';
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 pt-12 overflow-y-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-card rounded-3xl shadow-2xl border border-border/50 w-full max-w-6xl overflow-hidden print:shadow-none print:border-0 print:rounded-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border/50 print:border-b-2">
            <div className="flex items-center gap-3">
              <ArrowUpDown className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {es ? 'Comparación de Candidatos' : 'Candidate Comparison'}
                </h2>
                <p className="text-xs text-muted">
                  {sorted.length} {es ? 'candidatos • ordenados por puntuación' : 'candidates • sorted by score'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all cursor-pointer"
              >
                <Download className="h-3 w-3" />
                {es ? 'Exportar PDF' : 'Export PDF'}
              </button>
              <button
                onClick={onClose}
                className="flex items-center justify-center h-8 w-8 rounded-xl hover:bg-background transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-6 py-4 text-xs font-medium text-muted uppercase tracking-wider sticky left-0 bg-card z-10 w-48">
                    {es ? 'Métrica' : 'Metric'}
                  </th>
                  {sorted.map((c, i) => (
                    <th key={c.id} className="text-center px-4 py-4 min-w-[160px]">
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {c.candidate.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
                          {c.candidate.name}
                        </span>
                        {i === 0 && sorted.length > 1 && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-success/10 text-success">
                            {es ? '🏆 Mejor' : '🏆 Top'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {/* Overall Score */}
                <tr className="bg-muted/5">
                  <td className="px-6 py-3.5 text-sm font-semibold text-foreground sticky left-0 bg-muted/5 z-10">
                    {es ? 'Puntuación General' : 'Overall Score'}
                  </td>
                  {sorted.map(c => (
                    <td key={c.id} className="text-center px-4 py-3.5">
                      <span className={`text-2xl font-bold ${getScoreColor(c.evaluation?.overallScore || 0)}`}>
                        {c.evaluation?.overallScore || '—'}
                      </span>
                      <span className="text-xs text-muted">/100</span>
                    </td>
                  ))}
                </tr>

                {/* Recommendation */}
                <tr>
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground sticky left-0 bg-card z-10">
                    {es ? 'Recomendación' : 'Recommendation'}
                  </td>
                  {sorted.map(c => (
                    <td key={c.id} className="text-center px-4 py-3.5">
                      {c.evaluation ? (
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getRecStyles(c.evaluation.recommendation)}`}>
                          {c.evaluation.recommendation}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Topic Scores */}
                {[...allTopics].map(topic => (
                  <tr key={topic} className="hover:bg-background/50 transition-colors">
                    <td className="px-6 py-3 text-sm text-foreground sticky left-0 bg-card z-10 truncate max-w-[200px]" title={topic}>
                      {topic}
                    </td>
                    {sorted.map(c => {
                      const score = c.evaluation?.topicScores?.[topic];
                      return (
                        <td key={c.id} className="text-center px-4 py-3">
                          {score !== undefined ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-2 rounded-full bg-border/40 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    score >= 8 ? 'bg-success' : score >= 6 ? 'bg-primary' : score >= 4 ? 'bg-warning' : 'bg-danger'
                                  }`}
                                  style={{ width: `${(score / 10) * 100}%` }}
                                />
                              </div>
                              <span className={`text-sm font-semibold ${getScoreColor(score, 10)}`}>
                                {score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Pros */}
                <tr className="bg-success/[0.02]">
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground sticky left-0 bg-success/[0.02] z-10">
                    {es ? 'Fortalezas' : 'Key Strengths'}
                  </td>
                  {sorted.map(c => (
                    <td key={c.id} className="px-4 py-3.5 align-top">
                      {c.evaluation?.pros ? (
                        <ul className="space-y-1">
                          {c.evaluation.pros.slice(0, 3).map((pro, i) => (
                            <li key={i} className="text-xs text-foreground/80 leading-relaxed flex items-start gap-1.5">
                              <span className="text-success mt-0.5 shrink-0">•</span>
                              <span className="line-clamp-2">{pro}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Cons */}
                <tr className="bg-danger/[0.02]">
                  <td className="px-6 py-3.5 text-sm font-medium text-foreground sticky left-0 bg-danger/[0.02] z-10">
                    {es ? 'Áreas de Mejora' : 'Areas to Improve'}
                  </td>
                  {sorted.map(c => (
                    <td key={c.id} className="px-4 py-3.5 align-top">
                      {c.evaluation?.cons ? (
                        <ul className="space-y-1">
                          {c.evaluation.cons.slice(0, 3).map((con, i) => (
                            <li key={i} className="text-xs text-foreground/80 leading-relaxed flex items-start gap-1.5">
                              <span className="text-danger mt-0.5 shrink-0">•</span>
                              <span className="line-clamp-2">{con}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Date */}
                <tr>
                  <td className="px-6 py-3 text-sm text-muted sticky left-0 bg-card z-10">
                    {es ? 'Fecha' : 'Date'}
                  </td>
                  {sorted.map(c => (
                    <td key={c.id} className="text-center px-4 py-3 text-xs text-muted">
                      {new Date(c.date).toLocaleDateString(es ? 'es-MX' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
