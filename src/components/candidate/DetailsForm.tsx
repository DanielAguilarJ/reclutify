'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, ArrowRight } from 'lucide-react';
import { useInterviewStore } from '@/store/interviewStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

export default function DetailsForm() {
  const { setCandidate, setPhase, candidate } = useInterviewStore();
  const { language } = useAppStore();
  const t = dictionaries[language];

  const [name, setName] = useState(candidate?.name || '');
  const [email, setEmail] = useState(candidate?.email || '');
  const [phone, setPhone] = useState(candidate?.phone || '');
  const [linkedinUrl, setLinkedinUrl] = useState(candidate?.linkedinUrl || '');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t.errors.nameRequired;
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))
      newErrors.email = t.errors.emailRequired;
    if (!phone.trim()) newErrors.phone = t.errors.phoneRequired;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setCandidate({ name, email, phone, linkedinUrl });
    setPhase('overview');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {t.welcomeTitle}
          </h1>
          <p className="text-muted text-sm">
            {t.welcomeSub}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t.fullName}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-foreground text-sm 
                  placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  transition-all ${errors.name ? 'border-danger' : 'border-border'}`}
              />
            </div>
            {errors.name && (
              <p className="text-danger text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t.emailAddress}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-foreground text-sm
                  placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  transition-all ${errors.email ? 'border-danger' : 'border-border'}`}
              />
            </div>
            {errors.email && (
              <p className="text-danger text-xs mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t.phoneNumber}
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-foreground text-sm
                  placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                  transition-all ${errors.phone ? 'border-danger' : 'border-border'}`}
              />
            </div>
            {errors.phone && (
              <p className="text-danger text-xs mt-1">{errors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t.linkedinUrl}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder={t.linkedinPlaceholder}
                className="w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-foreground text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all border-border"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-primary 
              text-white font-medium text-sm hover:bg-primary-hover transition-colors mt-2 cursor-pointer"
          >
            {t.nextButton}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </motion.div>
  );
}
