'use client';

import { motion } from 'framer-motion';
import { Clock, ArrowRight, BookOpen } from 'lucide-react';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

export default function InterviewOverview() {
  const { topics, setPhase, candidate } = useInterviewStore();
  const { language } = useAppStore();
  const t = dictionaries[language];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-lg"
    >
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {t.overviewTitle}
          </h1>
          <p className="text-muted text-sm">
            {language === 'es' ? `Hola ${candidate.name}, ` : `Hi ${candidate.name}, `} {t.overviewSub}
          </p>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary-light/50 mb-6">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {t.estimatedDuration}
            </p>
            <p className="text-xs text-muted">{t.durationTime}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              {t.topicsCovered}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span
                key={topic.id}
                className="px-3 py-1.5 rounded-full bg-primary-light/60 text-primary text-xs font-medium
                  border border-primary/10"
              >
                {topic.label}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-background border border-border/50 mb-6">
          <p className="text-xs text-muted leading-relaxed">
            <strong className="text-foreground">{t.beforeStarting}</strong> {t.beforeStartingText}
          </p>
        </div>

        <button
          onClick={() => setPhase('hardware')}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-primary
            text-white font-medium text-sm hover:bg-primary-hover transition-colors cursor-pointer"
        >
          {t.continueHardware}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
