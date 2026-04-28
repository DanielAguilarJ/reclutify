'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, ArrowRight, UploadCloud, Loader2, CheckCircle2 } from 'lucide-react';
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

  const [cvLoading, setCvLoading] = useState(false);
  const [cvSuccess, setCvSuccess] = useState(false);
  const [cvError, setCvError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLoading(true);
    setCvError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/parse-resume', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Error upload');
      const json = await res.json();
      if (json.data) {
         // FIX BUG 1: Compute resolved values BEFORE calling any state setters.
         // React useState setters are async — reading `name` after setName()
         // in the same closure still returns the stale closure value.
         const resolvedName = name || json.data.name || '';
         const resolvedEmail = email || json.data.email || '';
         const resolvedPhone = phone || json.data.phone || '';

         if (json.data.name && !name) setName(resolvedName);
         if (json.data.email && !email) setEmail(resolvedEmail);
         if (json.data.phone && !phone) setPhone(resolvedPhone);

         setCandidate({
           ...candidate,
           name: resolvedName,
           email: resolvedEmail,
           phone: resolvedPhone,
           linkedinUrl,
           cvData: json.data,
         });
      }
      setCvSuccess(true);
    } catch(err) {
       setCvError(language === 'es' ? 'No se pudo leer el CV' : 'Could not parse CV');
    } finally {
       setCvLoading(false);
    }
  };

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
    // FIX BUG 2: Spread existing candidate to preserve cvData and any other fields
    setCandidate({ ...candidate, name, email, phone, linkedinUrl });
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
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center justify-between">
              <span>{language === 'es' ? 'Sube tu CV (Opcional)' : 'Upload your CV (Optional)'}</span>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{language === 'es' ? 'Dará contexto a la IA' : 'Provides AI context'}</span>
            </label>
            <div className={`border border-dashed ${cvSuccess ? 'border-success/50 bg-success/5' : 'border-border bg-muted/5'} rounded-xl p-4 flex flex-col items-center justify-center relative hover:bg-muted/10 transition-colors cursor-pointer`} onClick={() => fileInputRef.current?.click()}>
              {cvLoading ? (
                 <div className="flex items-center gap-2 text-primary text-sm font-medium"><Loader2 className="h-4 w-4 animate-spin"/> {language === 'es' ? 'Analizando CV e indexando...' : 'Parsing CV & Indexing...'}</div>
              ) : cvSuccess ? (
                 <div className="flex items-center gap-2 text-success text-sm font-medium"><CheckCircle2 className="h-4 w-4"/> {language === 'es' ? 'CV Cargado y Analizado Existosamente' : 'CV Uploaded & Accurately Parsed'}</div>
              ) : (
                <>
                  <UploadCloud className="h-5 w-5 text-muted mb-2" />
                  <span className="text-xs text-muted font-medium text-center">{language === 'es' ? 'Haz click para subir PDF o DOCX' : 'Click to upload PDF or DOCX'}<br/><span className="text-[10px] opacity-70">El autocompletado rellenará los campos debajo automáticamente</span></span>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileUpload} disabled={cvLoading || cvSuccess} />
            </div>
            {cvError && <p className="text-danger text-xs mt-1">{cvError}</p>}
          </div>

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
