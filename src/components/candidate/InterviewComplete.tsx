/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Home, Loader2, AlertTriangle } from 'lucide-react';
import { useInterviewStore } from '@/store/interviewStore';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { useWebhookStore } from '@/store/webhookStore';
import { dictionaries } from '@/lib/i18n';

export default function InterviewComplete() {
  const { candidate, transcript, topics, reset, sessionId, setSessionId, roleId: storeRoleId } = useInterviewStore();
  const { addCandidate, updateCandidate, candidates, roles } = useAdminStore();
  const { language } = useAppStore();
  const t = dictionaries[language];
  
  const [isEvaluating, setIsEvaluating] = useState(true);
  const [evalError, setEvalError] = useState(false);
  const hasEvaluatedRef = useRef(false); // Prevent double evaluation

  useEffect(() => {
    // Prevent double evaluation on React strict mode remounts
    if (hasEvaluatedRef.current) return;
    hasEvaluatedRef.current = true;
    
    let isMounted = true;
    const evaluateInterview = async () => {
      // FIX 6: The URL pattern is /interview/t/[TOKEN] — the last path segment is the TOKEN,
      // NOT a roleId. Using it as roleId would corrupt evaluation data.
      // Prefer the store value; if absent, warn and degrade gracefully rather than use a wrong ID.
      let currentRoleId = storeRoleId || '';
      if (!currentRoleId) {
        console.warn(
          'InterviewComplete: roleId not found in store. Evaluation roleId will be empty — ' +
          'data is still saved but role-level context may be missing.'
        );
        // currentRoleId stays ''; evaluation will proceed without role context.
      }
      const currentRole = roles.find(r => r.id === currentRoleId);

      // STEP 1: Immediately ensure the candidate exists in the pipeline with transcript
      // This guarantees data is saved even if the evaluation API fails
      const durationStr = localStorage.getItem('tempDuration');
      const currentSessionId = sessionId || `cand-${Date.now()}`;
      
      const existingCandidate = candidates.find(c => c.id === currentSessionId);
      if (!existingCandidate) {
        addCandidate({
          id: currentSessionId,
          candidate,
          roleId: currentRoleId,
          roleTitle: currentRole?.title || 'Position',
          date: Date.now(),
          status: 'in-progress',
          transcript,
          duration: durationStr ? parseInt(durationStr, 10) : 0,
        });
        if (!sessionId) setSessionId(currentSessionId);
      }

      // STEP 2: Try evaluation with retries
      let evalData = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch('/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              transcript, 
              topics, 
              candidateName: candidate.name, 
              language,
              roleTitle: currentRole?.title || 'Candidate',
              roleDescription: `
                ${currentRole?.description || ''}
                ${currentRole?.jobType ? `- Tipo de Puesto: ${currentRole.jobType}` : ''}
                ${currentRole?.location ? `- Ubicación: ${currentRole.location}` : ''}
                ${currentRole?.salary ? `- Salario: ${currentRole.salary}` : ''}
              `.trim()
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Evaluation API returned ${response.status}`);
          }
          
          const data = await response.json();
          evalData = data.evaluation || data;
          break; // Success — exit retry loop
          
        } catch (err) {
          console.error(`Eval attempt ${attempt}/${maxRetries} failed:`, err);
          if (attempt < maxRetries) {
            // Wait before retrying (exponential backoff: 2s, 4s)
            await new Promise(res => setTimeout(res, attempt * 2000));
          }
        }
      }

      if (!isMounted) return;

      const videoUrl = localStorage.getItem('tempVideoUrl');
      
      // STEP 3: Save final result — ALWAYS save, with or without evaluation
      if (evalData) {
        updateCandidate(currentSessionId, {
          status: 'completed',
          transcript,
          duration: durationStr ? parseInt(durationStr, 10) : 0,
          videoUrl: videoUrl || undefined,
          evaluation: evalData,
        });

        // Module 4: Fire webhook if configured
        const { webhookUrl, webhookSecret, addLog } = useWebhookStore.getState();
        if (webhookUrl) {
          try {
            const webhookRes = await fetch('/api/webhooks/candidate-completed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                webhookUrl,
                webhookSecret,
                candidateId: currentSessionId,
                roleId: currentRoleId,
                candidateName: candidate.name,
                overallScore: evalData.overallScore,
                recommendation: evalData.recommendation,
                topicScores: evalData.topicScores,
                completedAt: new Date().toISOString(),
              }),
            });
            const webhookData = await webhookRes.json();
            addLog({
              id: `log-${Date.now()}`,
              timestamp: Date.now(),
              status: webhookData.success ? 'success' : 'error',
              responseCode: webhookData.statusCode || 0,
              payload: `${candidate.name} — ${evalData.recommendation}`,
            });
          } catch (webhookErr) {
            console.error('Webhook delivery failed (non-blocking):', webhookErr);
          }
        }
      } else {
        // Evaluation failed after all retries — still save as completed with transcript
        updateCandidate(currentSessionId, {
          status: 'completed',
          transcript,
          duration: durationStr ? parseInt(durationStr, 10) : 0,
          videoUrl: videoUrl || undefined,
        });
        setEvalError(true);
      }
      
      localStorage.removeItem('tempDuration');
      localStorage.removeItem('tempVideoUrl');
      
      setIsEvaluating(false);
      setSessionId(null);
    };

    evaluateInterview();
    return () => { isMounted = false; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md"
    >
      <div className="bg-card rounded-[24px] shadow-sm border border-border/50 p-8 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2 tracking-tight">
          {t.interviewComplete}
        </h1>
        <p className="text-muted text-sm mb-8 leading-relaxed">
          {t.greatJob} <span className="font-semibold text-foreground">{candidate.name}</span>! {t.submittedSub}
        </p>

        {isEvaluating ? (
          <div className="flex flex-col items-center justify-center p-6 bg-background rounded-2xl border border-border/50 w-full mb-8">
            <Loader2 className="h-6 w-6 text-primary animate-spin mb-3" />
            <p className="text-sm font-medium text-muted">
              {language === 'es' ? 'Analizando tus respuestas con IA...' : 'Analyzing your responses with AI...'}
            </p>
          </div>
        ) : evalError ? (
          <div className="flex flex-col items-center justify-center p-6 bg-warning/5 rounded-2xl border border-warning/20 w-full mb-8">
            <AlertTriangle className="h-6 w-6 text-warning mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              {language === 'es' ? 'Evaluación pendiente' : 'Evaluation pending'}
            </p>
            <p className="text-xs text-muted leading-relaxed">
              {language === 'es' 
                ? 'Tu entrevista fue guardada exitosamente. La evaluación con IA se procesará más tarde.'
                : 'Your interview was saved successfully. The AI evaluation will be processed later.'}
            </p>
          </div>
        ) : (
          <div className="bg-background rounded-2xl p-5 border border-border/50 mb-8 w-full text-left">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              {t.whatHappensNext}
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              {t.nextText}
            </p>
          </div>
        )}

        <button
          onClick={() => {
            reset();
            window.location.href = '/';
          }}
          disabled={isEvaluating}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-full font-medium text-sm transition-all shadow-sm ${
            isEvaluating 
              ? 'bg-muted/40 text-muted cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary-hover shadow-primary/25 cursor-pointer'
          }`}
        >
          <Home className="h-4 w-4" />
          {t.returnHome}
        </button>
      </div>
    </motion.div>
  );
}
