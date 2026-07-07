'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, ArrowUpRight, Clock, CheckCircle2, AlertCircle, AlertTriangle, Bot, Loader2, ArrowUpDown } from 'lucide-react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { useRoles } from '@/hooks/useRoles';
import { useCandidates } from '@/hooks/useCandidates';
import type { CandidateResult } from '@/types';
import CompareModal from '@/components/admin/CompareModal';

export default function PipelinePage() {
  const { candidates, roles, updateCandidate } = useAdminStore();
  const { language } = useAppStore();

  // Sincronizar con Supabase al montar
  useRoles();
  useCandidates();

  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [evalErrorId, setEvalErrorId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const handleProcessPartial = async (candidate: CandidateResult) => {
    setEvaluatingId(candidate.id);
    setEvalErrorId(null);
    try {
      const role = roles.find(r => r.id === candidate.roleId);
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: candidate.transcript,
          topics: role?.topics || [],
          candidateName: candidate.candidate.name,
          language,
          roleTitle: candidate.roleTitle,
          roleDescription: `
            ${role?.description || ''}
            ${role?.jobType ? `- Tipo de Puesto: ${role.jobType}` : ''}
            ${role?.location ? `- Ubicación: ${role.location}` : ''}
            ${role?.salary ? `- Salario: ${role.salary}` : ''}
          `.trim()
        }),
      });

      // BUG FIX: the previous version never checked response.ok nor validated
      // the shape of the payload. A failed /api/evaluate call (e.g. 500, or a
      // JSON-parse failure upstream) returns { error: '...' } with no
      // overallScore/recommendation -- that was being saved as if it were a
      // real evaluation and marked 'completed', silently corrupting the report.
      if (!response.ok) {
        throw new Error(`Evaluation API returned ${response.status}`);
      }
      const data = await response.json();
      const evalData = data.evaluation || data;
      if (!evalData || typeof evalData.overallScore !== 'number') {
        throw new Error('Evaluation response missing overallScore');
      }

      updateCandidate(candidate.id, {
        status: 'completed',
        evaluation: evalData,
      });
    } catch (err) {
      console.error('Manual eval error', err);
      setEvalErrorId(candidate.id);
      // Make sure the candidate is left in a visibly-distinguishable state
      // (not silently stuck as 'in-progress') so it's clear a retry is needed.
      updateCandidate(candidate.id, { status: 'pending-evaluation' });
    } finally {
      setEvaluatingId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const evaluatedCandidates = filteredCandidates.filter(c => c.evaluation);
    if (selectedIds.size === evaluatedCandidates.length && evaluatedCandidates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(evaluatedCandidates.map(c => c.id)));
    }
  };

  const selectedCandidates = candidates.filter(c => selectedIds.has(c.id) && c.evaluation);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
            <CheckCircle2 className="h-3 w-3" />
            {language === 'es' ? 'Completado' : 'Completed'}
          </span>
        );
      case 'in-progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-medium">
            <Clock className="h-3 w-3" />
            {language === 'es' ? 'En Progreso' : 'In Progress'}
          </span>
        );
      case 'pending-evaluation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 text-xs font-medium">
            <AlertTriangle className="h-3 w-3" />
            {language === 'es' ? 'Evaluación Fallida' : 'Evaluation Failed'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/10 text-muted text-xs font-medium">
            <AlertCircle className="h-3 w-3" />
            {language === 'es' ? 'Pendiente' : 'Pending'}
          </span>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-danger';
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case 'Strong Hire':
        return 'bg-success/10 text-success border-success/20';
      case 'Hire':
        return 'bg-primary/10 text-primary border-primary/20';
      default:
        return 'bg-danger/10 text-danger border-danger/20';
    }
  };

  const filteredCandidates = candidates.filter(candidate => {
    const searchLower = searchQuery.toLowerCase();
    return (
      candidate.candidate.name.toLowerCase().includes(searchLower) ||
      candidate.candidate.email.toLowerCase().includes(searchLower) ||
      candidate.roleTitle.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            {language === 'es' ? 'Tubería de Candidatos' : 'Candidate Pipeline'}
          </h1>
          <p className="text-sm text-muted">
            {filteredCandidates.length} {language === 'es' ? 'candidatos' : 'candidates'}
            {searchQuery && (
              <span className="ml-1 opacity-70">
                ({language === 'es' ? 'de' : 'of'} {candidates.length})
              </span>
            )}
          </p>

        </div>

        <div className="flex items-center gap-3">
          {/* Compare Button — Module 3 */}
          {selectedIds.size >= 2 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setShowCompare(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors shadow-lg shadow-primary/25 cursor-pointer"
            >
              <ArrowUpDown className="h-4 w-4" />
              {language === 'es' ? `Comparar (${selectedIds.size})` : `Compare (${selectedIds.size})`}
            </motion.button>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'es' ? 'Buscar candidatos...' : 'Search candidates...'}
              className="pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm
                placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              {/* Checkbox column — Module 3 */}
              <th className="px-4 py-3.5 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredCandidates.filter(c => c.evaluation).length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer accent-primary"
                />
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Candidato' : 'Candidate'}
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Puesto' : 'Role'}
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Fecha' : 'Date'}
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Estado' : 'Status'}
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Puntuación' : 'Score'}
              </th>
              <th className="text-left px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Recomendación' : 'Recommendation'}
              </th>
              <th className="text-right px-6 py-3.5 text-xs font-medium text-muted uppercase tracking-wider">
                {language === 'es' ? 'Acción' : 'Action'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filteredCandidates.map((candidate, index) => (
              <motion.tr

                key={candidate.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`transition-colors ${
                  selectedIds.has(candidate.id) 
                    ? 'bg-primary/5' 
                    : 'hover:bg-background/50'
                }`}
              >
                {/* Checkbox — Module 3 */}
                <td className="px-4 py-4">
                  {candidate.evaluation ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(candidate.id)}
                      onChange={() => toggleSelect(candidate.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer accent-primary"
                    />
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {candidate.candidate.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {candidate.candidate.name}
                      </p>
                      <p className="text-xs text-muted">
                        {candidate.candidate.email}
                        {candidate.source === 'public_link' && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-600">
                            Link
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-foreground">
                    {candidate.roleTitle}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-muted">
                    {new Date(candidate.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(candidate.status)}
                </td>
                <td className="px-6 py-4">
                  {candidate.evaluation ? (
                    <span
                      className={`text-sm font-semibold ${getScoreColor(
                        candidate.evaluation.overallScore
                      )}`}
                    >
                      {candidate.evaluation.overallScore}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {candidate.evaluation ? (
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRecommendationBadge(
                        candidate.evaluation.recommendation
                      )}`}
                    >
                      {candidate.evaluation.recommendation}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {(candidate.status === 'in-progress' || candidate.status === 'pending-evaluation') && !candidate.evaluation && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => handleProcessPartial(candidate)}
                        disabled={evaluatingId === candidate.id}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-light text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        {evaluatingId === candidate.id ? (
                           <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                           <Bot className="h-3 w-3" />
                        )}
                        {candidate.status === 'pending-evaluation'
                          ? (language === 'es' ? 'Re-evaluar' : 'Re-evaluate')
                          : (language === 'es' ? 'Evaluar Abandono' : 'Evaluate Dropout')}
                      </button>
                      {evalErrorId === candidate.id && (
                        <span className="text-[10px] text-danger">
                          {language === 'es' ? 'Error al evaluar. Intenta de nuevo.' : 'Evaluation failed. Try again.'}
                        </span>
                      )}
                    </div>
                  )}
                  {candidate.evaluation && (
                    <Link
                      href={`/admin/report/${candidate.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover
                        transition-colors"
                    >
                      {language === 'es' ? 'Ver Reporte' : 'View Report'}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Compare Modal — Module 3 */}
      {showCompare && selectedCandidates.length >= 2 && (
        <CompareModal
          candidates={selectedCandidates}
          onClose={() => setShowCompare(false)}
          language={language}
        />
      )}
    </div>
  );
}
