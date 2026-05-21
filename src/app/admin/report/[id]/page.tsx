'use client';

import { use, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Mail,
  Phone,
  Calendar,
  Award,
  MessageSquare,
  Bot,
  User,
  Download,
  Crown,
  FileText,
  Quote,
  AlertTriangle,
  Lightbulb,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import ScoreGauge from '@/components/admin/ScoreGauge';
import TopicScoreBar from '@/components/admin/TopicScoreBar';
import PDFExportButton from '@/components/admin/ScorecardPDF';

export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { candidates } = useAdminStore();
  const { language, planTier } = useAppStore();
  const candidate = candidates.find((c) => c.id === id);

  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'sentiment'>('overview');

  if (!candidate || !candidate.evaluation) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted text-sm mb-4">Report not found</p>
        <Link
          href="/admin/pipeline"
          className="text-primary text-sm hover:underline"
        >
          ← Back to Pipeline
        </Link>
      </div>
    );
  }

  const { evaluation } = candidate;

  const getRecommendationStyle = (rec: string) => {
    switch (rec) {
      case 'Strong Hire':
        return 'bg-success/10 text-success border-success/20';
      case 'Hire':
        return 'bg-primary/10 text-primary border-primary/20';
      default:
        return 'bg-danger/10 text-danger border-danger/20';
    }
  };

  const getBiasSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-danger/10 text-danger border-danger/20';
      case 'medium':
        return 'bg-warning/10 text-warning border-warning/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  // Check if sentiment data exists in transcript
  const hasSentimentData = candidate.transcript?.some(e => e.role === 'user' && e.sentiment);

  const handleExportTranscript = () => {
    if (!candidate || !evaluation) return;

    const title = language === 'es' ? 'REPORTE DE ENTREVISTA' : 'INTERVIEW REPORT';
    const candName = `${language === 'es' ? 'Candidato' : 'Candidate'}: ${evaluation.candidateName}`;
    const roleText = `${language === 'es' ? 'Puesto' : 'Role'}: ${candidate.roleTitle}`;
    const scoreText = `${language === 'es' ? 'Puntuación General' : 'Overall Score'}: ${evaluation.overallScore}/100`;
    const recText = `${language === 'es' ? 'Recomendación' : 'Recommendation'}: ${evaluation.recommendation}`;
    
    let content = `========================================\n`;
    content += `${title}\n`;
    content += `========================================\n\n`;
    content += `${candName}\n`;
    content += `${roleText}\n`;
    content += `${scoreText}\n`;
    content += `${recText}\n\n`;

    // Executive Summary
    if (evaluation.executiveSummary) {
      content += `----------------------------------------\n`;
      content += `${language === 'es' ? 'RESUMEN EJECUTIVO' : 'EXECUTIVE SUMMARY'}\n`;
      content += `----------------------------------------\n`;
      content += `${evaluation.executiveSummary}\n\n`;
    }
    
    content += `----------------------------------------\n`;
    content += `${language === 'es' ? 'PROS (Fortalezas)' : 'PROS (Strengths)'}\n`;
    content += `----------------------------------------\n`;
    evaluation.pros.forEach(pro => content += `• ${pro}\n`);
    content += `\n`;

    content += `----------------------------------------\n`;
    content += `${language === 'es' ? 'CONTRAS (Áreas de Mejora)' : 'CONS (Areas for Improvement)'}\n`;
    content += `----------------------------------------\n`;
    evaluation.cons.forEach(con => content += `• ${con}\n`);
    content += `\n`;

    // Hiring Risks
    if (evaluation.hiringRisks && evaluation.hiringRisks.length > 0) {
      content += `----------------------------------------\n`;
      content += `${language === 'es' ? 'RIESGOS DE CONTRATACIÓN' : 'HIRING RISKS'}\n`;
      content += `----------------------------------------\n`;
      evaluation.hiringRisks.forEach(risk => content += `⚠ ${risk}\n`);
      content += `\n`;
    }

    // Onboarding Tips
    if (evaluation.onboardingTips && evaluation.onboardingTips.length > 0) {
      content += `----------------------------------------\n`;
      content += `${language === 'es' ? 'TIPS DE ONBOARDING' : 'ONBOARDING TIPS'}\n`;
      content += `----------------------------------------\n`;
      evaluation.onboardingTips.forEach(tip => content += `🎯 ${tip}\n`);
      content += `\n`;
    }

    content += `----------------------------------------\n`;
    content += `${language === 'es' ? 'TRANSCRIPCIÓN COMPLETA' : 'FULL TRANSCRIPT'}\n`;
    content += `----------------------------------------\n\n`;

    candidate.transcript.forEach(entry => {
      const roleName = entry.role === 'assistant' ? 'ZARA (AI)' : evaluation.candidateName;
      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      content += `[${time}] ${roleName}: ${entry.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-${evaluation.candidateName.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/pipeline"
          className="flex items-center justify-center h-9 w-9 rounded-xl bg-card border border-border/50
            hover:bg-background transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {evaluation.candidateName}
          </h1>
          <p className="text-sm text-muted">{candidate.roleTitle}</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <PDFExportButton candidate={candidate} language={language} />
          <button
            onClick={handleExportTranscript}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 cursor-pointer"
          >
            <Download className="h-3 w-3" />
            {language === 'es' ? 'Exportar Transcripción' : 'Export Transcript'}
          </button>
          
          <span
            className={`px-4 py-1.5 rounded-full text-sm font-medium border ${getRecommendationStyle(
              evaluation.recommendation
            )}`}
          >
            <Award className="inline h-4 w-4 mr-1 -mt-0.5" />
            {evaluation.recommendation}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border/50 pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          {language === 'es' ? 'Resumen de Evaluación' : 'Evaluation Overview'}
        </button>
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'transcript'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          {language === 'es' ? 'Transcripción' : 'Transcript'}
        </button>
        {hasSentimentData && (
          <button
            onClick={() => setActiveTab('sentiment')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'sentiment'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            {language === 'es' ? 'Sentimiento' : 'Sentiment'}
          </button>
        )}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Score Gauge + Info */}
        <div className="space-y-4">
          {/* Score Gauge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 flex flex-col items-center"
          >
            <h3 className="text-sm font-medium text-muted mb-4">
              Overall Score
            </h3>
            <ScoreGauge score={evaluation.overallScore} />
          </motion.div>

          {/* Candidate Info */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">
              Candidate Details
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted" />
                <span className="text-sm text-foreground">
                  {candidate.candidate.email}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted" />
                <span className="text-sm text-foreground">
                  {candidate.candidate.phone}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted" />
                <span className="text-sm text-foreground">
                  {new Date(candidate.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Video Recording */}
          {candidate.videoUrl && (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5 flex flex-col items-center overflow-hidden">
              <h3 className="text-sm font-medium text-foreground mb-3 self-start">
                Interview Recording
              </h3>
              <div className="w-full aspect-video rounded-xl bg-black overflow-hidden border border-border/50">
                <video 
                  src={candidate.videoUrl} 
                  controls 
                  className="w-full h-full object-contain"
                />
              </div>
              {candidate.duration !== undefined && candidate.duration > 0 && (
                <p className="text-xs text-muted mt-3 self-start font-medium">
                  {language === 'es' ? 'Duración:' : 'Duration:'} {Math.floor(candidate.duration / 60).toString().padStart(2, '0')}:{(candidate.duration % 60).toString().padStart(2, '0')}
                </p>
              )}
            </div>
          )}

          {/* Bias Check — Module 1 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-card rounded-2xl shadow-sm border border-border/50 p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              {(!evaluation.biasFlags || evaluation.biasFlags.length === 0) ? (
                <ShieldCheck className="h-4 w-4 text-success" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-warning" />
              )}
              <h3 className="text-sm font-medium text-foreground">
                {language === 'es' ? 'Verificación de Sesgo' : 'Bias Check'}
              </h3>
            </div>
            {(!evaluation.biasFlags || evaluation.biasFlags.length === 0) ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-success/5 border border-success/10">
                <ShieldCheck className="h-5 w-5 text-success shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">
                  {language === 'es' 
                    ? 'No se detectaron sesgos potenciales en esta evaluación. La puntuación se basa únicamente en las respuestas del candidato.'
                    : 'No potential biases detected in this evaluation. Scoring is based solely on the candidate\'s responses.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {evaluation.biasFlags.map((flag, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border ${getBiasSeverityStyle(flag.severity)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        {flag.type.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${getBiasSeverityStyle(flag.severity)}`}>
                        {flag.severity}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{flag.description}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Column - Pros/Cons + Topic Scores + Enhanced Sections */}
        <div className="lg:col-span-2 space-y-4">

          {/* Executive Summary — Module 7 */}
          {evaluation.executiveSummary && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-primary/5 via-card to-card rounded-2xl shadow-sm border border-primary/10 p-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-medium text-foreground">
                  {language === 'es' ? 'Resumen Ejecutivo' : 'Executive Summary'}
                </h3>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {evaluation.executiveSummary}
              </p>
            </motion.div>
          )}

          {/* Pros & Cons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-2xl shadow-sm border border-border/50 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="h-4 w-4 text-success" />
                <h3 className="text-sm font-medium text-foreground">
                  Strengths
                </h3>
              </div>
              <div className="space-y-2">
                {evaluation.pros.map((pro, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-success/5 border border-success/10"
                  >
                    <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                    <p className="text-xs text-foreground leading-relaxed">
                      {pro}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-2xl shadow-sm border border-border/50 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="h-4 w-4 text-danger" />
                <h3 className="text-sm font-medium text-foreground">
                  Areas for Improvement
                </h3>
              </div>
              <div className="space-y-2">
                {evaluation.cons.map((con, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/5 border border-danger/10"
                  >
                    <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
                    <p className="text-xs text-foreground leading-relaxed">
                      {con}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Interview Highlights — Module 7 */}
          {evaluation.interviewHighlights && evaluation.interviewHighlights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-card rounded-2xl shadow-sm border border-border/50 p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-purple-10">
                  <Quote className="h-4 w-4 text-purple-50" />
                </div>
                <h3 className="text-sm font-medium text-foreground">
                  {language === 'es' ? 'Momentos Destacados' : 'Interview Highlights'}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {evaluation.interviewHighlights.map((highlight, i) => (
                  <div
                    key={i}
                    className={`relative p-4 rounded-xl border ${
                      highlight.significance === 'positive'
                        ? 'bg-success/5 border-success/15'
                        : 'bg-danger/5 border-danger/15'
                    }`}
                  >
                    <div className="absolute top-3 right-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        highlight.significance === 'positive'
                          ? 'bg-success/10 text-success'
                          : 'bg-danger/10 text-danger'
                      }`}>
                        {highlight.significance === 'positive' 
                          ? (language === 'es' ? '✦ Fortaleza' : '✦ Strong') 
                          : (language === 'es' ? '⚡ Débil' : '⚡ Weak')}
                      </span>
                    </div>
                    <p className="text-xs italic text-foreground/80 leading-relaxed mb-2 pr-16">
                      &ldquo;{highlight.quote}&rdquo;
                    </p>
                    <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                      {highlight.topic}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Topic Scores */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl shadow-sm border border-border/50 p-6"
          >
            <h3 className="text-sm font-medium text-foreground mb-5">
              Topic Scores
            </h3>
            <div className="space-y-4">
              {Object.entries(evaluation.topicScores).map(([topic, score]) => (
                <TopicScoreBar key={topic} topic={topic} score={score} />
              ))}
            </div>
          </motion.div>

          {/* Hiring Risks & Onboarding Tips — Module 7 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Hiring Risks */}
            {evaluation.hiringRisks && evaluation.hiringRisks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-card rounded-2xl shadow-sm border border-border/50 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-warning/10">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {language === 'es' ? 'Riesgos de Contratación' : 'Hiring Risks'}
                  </h3>
                </div>
                <div className="space-y-2">
                  {evaluation.hiringRisks.map((risk, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/10"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{risk}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Onboarding Tips */}
            {evaluation.onboardingTips && evaluation.onboardingTips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="bg-card rounded-2xl shadow-sm border border-border/50 p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Lightbulb className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {language === 'es' ? 'Tips de Onboarding' : 'Onboarding Tips'}
                  </h3>
                </div>
                <div className="space-y-2">
                  {evaluation.onboardingTips.map((tip, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10"
                    >
                      <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      ) : activeTab === 'sentiment' ? (
        /* Sentiment Timeline Tab — Module 5 */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden"
        >
          <div className="p-5 border-b border-border/50 bg-muted/5">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {language === 'es' ? 'Timeline de Sentimiento' : 'Sentiment Timeline'}
            </h3>
            <p className="text-xs text-muted mt-1">
              {language === 'es' 
                ? 'Niveles de confianza del candidato durante la entrevista' 
                : 'Candidate confidence levels throughout the interview'}
            </p>
          </div>

          {/* SVG Chart */}
          <div className="p-6">
            {(() => {
              const sentimentEntries = candidate.transcript
                .filter(e => e.role === 'user' && e.sentiment)
                .map((e, idx) => ({ ...e, index: idx }));
              
              if (sentimentEntries.length === 0) return (
                <p className="text-sm text-muted text-center py-8">
                  {language === 'es' ? 'No hay datos de sentimiento disponibles.' : 'No sentiment data available.'}
                </p>
              );

              const width = 700;
              const height = 200;
              const padding = 40;
              const chartW = width - padding * 2;
              const chartH = height - padding * 2;
              const step = sentimentEntries.length > 1 ? chartW / (sentimentEntries.length - 1) : chartW;

              const points = sentimentEntries.map((e, i) => ({
                x: padding + (sentimentEntries.length > 1 ? i * step : chartW / 2),
                y: padding + chartH - (((e.sentiment?.confidence || 50) / 100) * chartH),
                confidence: e.sentiment?.confidence || 50,
                evasion: e.sentiment?.evasion || false,
                signals: e.sentiment?.keySignals || [],
              }));

              const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              const areaD = `${pathD} L ${points[points.length - 1].x} ${padding + chartH} L ${points[0].x} ${padding + chartH} Z`;

              return (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[700px] mx-auto">
                    {/* Grid lines */}
                    {[0, 25, 50, 75, 100].map(v => {
                      const y = padding + chartH - ((v / 100) * chartH);
                      return (
                        <g key={v}>
                          <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" />
                          <text x={padding - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{v}</text>
                        </g>
                      );
                    })}
                    {/* Area fill */}
                    <path d={areaD} fill="url(#sentimentGrad)" opacity="0.3" />
                    {/* Line */}
                    <path d={pathD} fill="none" stroke="#3b4cca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Data points */}
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="4" fill={p.evasion ? '#ef4444' : '#3b4cca'} stroke="white" strokeWidth="2" />
                        <text x={p.x} y={padding + chartH + 16} textAnchor="middle" fontSize="8" fill="#6b7280">Q{i + 1}</text>
                      </g>
                    ))}
                    {/* Gradient def */}
                    <defs>
                      <linearGradient id="sentimentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b4cca" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#3b4cca" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="text-xs text-muted">{language === 'es' ? 'Confianza Normal' : 'Normal Confidence'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-danger" />
                      <span className="text-xs text-muted">{language === 'es' ? 'Evasión Detectada' : 'Evasion Detected'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Signal Details */}
          <div className="p-6 pt-0 space-y-3">
            {candidate.transcript
              .filter(e => e.role === 'user' && e.sentiment)
              .map((entry, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border/30">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-semibold text-muted">Q{idx + 1}</span>
                    <div className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      (entry.sentiment?.confidence || 0) >= 70 ? 'bg-success/10 text-success' :
                      (entry.sentiment?.confidence || 0) >= 40 ? 'bg-warning/10 text-warning' :
                      'bg-danger/10 text-danger'
                    }`}>
                      {entry.sentiment?.confidence || 0}%
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 truncate">{entry.content.substring(0, 100)}...</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {entry.sentiment?.evasion && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/10">
                          <Eye className="inline h-2.5 w-2.5 mr-0.5" />
                          {language === 'es' ? 'Evasión' : 'Evasion'}
                        </span>
                      )}
                      {entry.sentiment?.keySignals?.map((signal, si) => (
                        <span key={si} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/10">
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </motion.div>
      ) : (
        /* Transcript Tab */
        <motion.div
           initial={{ opacity: 0, y: 12 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden flex flex-col h-[600px]"
        >
           <div className="p-5 border-b border-border/50 bg-muted/5 flex items-center justify-between">
             <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
               <MessageSquare className="h-4 w-4 text-primary" />
               {language === 'es' ? 'Transcripción de la Entrevista' : 'Interview Transcript'}
             </h3>
             <button
               onClick={handleExportTranscript}
               className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 cursor-pointer"
             >
               <Download className="h-3 w-3" />
               {language === 'es' ? 'Exportar Transcripción' : 'Export Transcript'}
             </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-6">
             {candidate.transcript && candidate.transcript.length > 0 ? (
               candidate.transcript.map((entry, idx) => (
                 <div key={idx} className={`flex gap-4 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}>
                   <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                     entry.role === 'assistant' ? 'bg-primary/10 text-primary' : 'bg-muted/10 text-muted-foreground'
                   }`}>
                     {entry.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                   </div>
                   <div className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'} max-w-[70%]`}>
                     <span className="text-xs text-muted mb-1 px-1">
                        {entry.role === 'assistant' ? 'Zara (AI)' : candidate.candidate.name} • {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </span>
                     <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                        entry.role === 'assistant' 
                          ? 'bg-background border border-border/50 text-foreground rounded-tl-sm' 
                          : 'bg-primary text-white rounded-tr-sm'
                     }`}>
                        {entry.content}

                     </div>
                   </div>
                 </div>
               ))
             ) : (
               <div className="flex flex-col items-center justify-center h-full text-muted">
                 <p className="text-sm">{language === 'es' ? 'No hay transcripción disponible.' : 'No transcript available.'}</p>
               </div>
             )}
           </div>
        </motion.div>
      )}
    </div>
  );
}
