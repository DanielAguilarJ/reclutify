'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Plus, Briefcase, Loader2, Crown, FileText, MapPin, DollarSign, Clock, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import type { Role, Topic, TopicRubric } from '@/types';
import Link from 'next/link';

// ─── Topic with rubric data (from API or manual) ───
interface TopicDraft {
  label: string;
  rubric?: TopicRubric;
}

// ─── Weight Slider Component ───
function WeightSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const getColor = (w: number) => {
    if (w >= 8) return 'from-red-500 to-orange-400';
    if (w >= 5) return 'from-amber-400 to-yellow-300';
    return 'from-emerald-400 to-green-300';
  };

  const getLabel = (w: number, lang: string) => {
    if (lang === 'es') {
      if (w >= 8) return 'Crítico';
      if (w >= 5) return 'Importante';
      return 'Básico';
    }
    if (w >= 8) return 'Critical';
    if (w >= 5) return 'Important';
    return 'Basic';
  };

  const { language } = useAppStore();

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 h-1.5 rounded-full appearance-none cursor-pointer accent-primary
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
        style={{
          background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(value / 10) * 100}%, #e2e8f0 ${(value / 10) * 100}%, #e2e8f0 100%)`
        }}
      />
      <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r ${getColor(value)} text-white min-w-[60px] text-center`}>
        {value}/10 {getLabel(value, language)}
      </div>
    </div>
  );
}

// ─── Topic Card with Rubric Details ───
function TopicCard({ topic, index, onRemove, onUpdateWeight, expanded, onToggle }: {
  topic: TopicDraft;
  index: number;
  onRemove: () => void;
  onUpdateWeight: (weight: number) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { language } = useAppStore();
  const rubric = topic.rubric;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -8 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="bg-background rounded-xl border border-border/50 overflow-hidden"
    >
      {/* Header Row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">{topic.label}</span>
        </div>
        
        {rubric && (
          <WeightSlider value={rubric.weight} onChange={onUpdateWeight} />
        )}
        
        {rubric && (
          <button
            onClick={onToggle}
            className="p-1 rounded-lg hover:bg-muted/10 transition-colors text-muted"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={onRemove}
          className="p-1 rounded-lg hover:bg-danger/10 transition-colors text-muted hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded Rubric Details */}
      <AnimatePresence>
        {expanded && rubric && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2 border-t border-border/30 pt-3">
              <div className="flex gap-2 items-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-success bg-success/10 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  9-10
                </span>
                <p className="text-xs text-muted leading-relaxed">{rubric.excellent}</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-warning bg-warning/10 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  6-8
                </span>
                <p className="text-xs text-muted leading-relaxed">{rubric.acceptable}</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-danger bg-danger/10 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  0-5
                </span>
                <p className="text-xs text-muted leading-relaxed">{rubric.poor}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Role Editor (for existing roles) ───
function RoleEditor({ role, onRemove }: { role: Role; onRemove: () => void }) {
  const { updateRole } = useAdminStore();
  const { language } = useAppStore();
  const [editedRole, setEditedRole] = useState({
    title: role.title,
    jobType: role.jobType || '',
    salary: role.salary || '',
    location: role.location || '',
    description: role.description || '',
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    updateRole(role.id, editedRole);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const hasChanges = 
    editedRole.title !== role.title ||
    editedRole.jobType !== (role.jobType || '') ||
    editedRole.salary !== (role.salary || '') ||
    editedRole.location !== (role.location || '') ||
    editedRole.description !== (role.description || '');

  return (
    <div className="border-t border-border/50 p-4 bg-muted/5 space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{language === 'es' ? 'Título' : 'Title'}</label>
        <input 
          value={editedRole.title} 
          onChange={(e) => setEditedRole({ ...editedRole, title: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">{language === 'es' ? 'Tipo de Trabajo' : 'Job Type'}</label>
          <input 
            value={editedRole.jobType} 
            placeholder={language === 'es' ? 'ej. Tiempo Completo' : 'e.g. Full Time'}
            onChange={(e) => setEditedRole({ ...editedRole, jobType: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">{language === 'es' ? 'Salario' : 'Salary'}</label>
          <input 
            value={editedRole.salary} 
            placeholder={language === 'es' ? 'ej. $4,000 MXN' : 'e.g. $4,000 MXN'}
            onChange={(e) => setEditedRole({ ...editedRole, salary: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{language === 'es' ? 'Ubicación' : 'Location'}</label>
        <input 
          value={editedRole.location} 
          placeholder={language === 'es' ? 'ej. Remoto' : 'e.g. Remote'}
          onChange={(e) => setEditedRole({ ...editedRole, location: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{language === 'es' ? 'Descripción' : 'Description'}</label>
        <textarea 
          value={editedRole.description} 
          onChange={(e) => setEditedRole({ ...editedRole, description: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[100px] resize-y"
          placeholder={language === 'es' ? 'Descripción del puesto...' : 'Job description...'}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {language === 'es' ? 'Temas de Evaluación' : 'Evaluation Topics'}
        </label>
        <div className="space-y-1.5 mt-1">
          {role.topics.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
              <span className="text-xs font-medium text-foreground flex-1">{t.label}</span>
              {t.rubric && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                  {t.rubric.weight}/10
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 flex justify-between items-center gap-3">
        <button
          onClick={onRemove}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
        >
          {language === 'es' ? 'Eliminar Puesto' : 'Delete Role'}
        </button>
        <div className="flex gap-2">
           {hasChanges && (
             <button
               onClick={() => setEditedRole({
                 title: role.title,
                 jobType: role.jobType || '',
                 salary: role.salary || '',
                 location: role.location || '',
                 description: role.description || '',
               })}
               className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:bg-muted/10 transition-colors"
             >
               {language === 'es' ? 'Cancelar' : 'Cancel'}
             </button>
           )}
           <button
             onClick={handleSave}
             disabled={!hasChanges && !saveSuccess}
             className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
               saveSuccess 
                 ? 'bg-success text-white' 
                 : hasChanges 
                   ? 'bg-primary text-white hover:bg-primary-hover' 
                   : 'bg-muted/20 text-muted cursor-not-allowed'
             }`}
           >
             {saveSuccess 
               ? (language === 'es' ? '✓ Guardado' : '✓ Saved') 
               : (language === 'es' ? 'Guardar Cambios' : 'Save Changes')}
           </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function CreateRolePage() {

  const { addRole, roles, removeRole } = useAdminStore();
  const { language, planTier } = useAppStore();
  const t = dictionaries[language];

  // Form state
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [generationLanguage, setGenerationLanguage] = useState<'es' | 'en'>(language === 'es' ? 'es' : 'en');
  const [candidateEmails, setCandidateEmails] = useState<string>('');
  
  // Topics state (now with rubric data)
  const [topics, setTopics] = useState<TopicDraft[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [expandedTopicIdx, setExpandedTopicIdx] = useState<number | null>(null);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [success, setSuccess] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  // ─── Generate rubric with AI ───
  const handleGenerateRubric = async () => {
    if (!jobTitle.trim()) return;
    setLoading(true);
    try {
      const response = await fetch('/api/generate-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jobTitle, 
          description: jobDescription,
          jobType,
          language: generationLanguage 
        }),
      });
      const data = await response.json();
      if (data.topics && Array.isArray(data.topics)) {
        // Handle both enriched objects and legacy string arrays
        const parsed: TopicDraft[] = data.topics.map((t: string | { label: string; rubric?: TopicRubric }) => {
          if (typeof t === 'string') {
            return { label: t };
          }
          return { label: t.label, rubric: t.rubric };
        });
        setTopics(parsed);
      }
    } catch (error) {
      console.error('Failed to generate rubric:', error);
      setTopics([
        { label: language === 'es' ? 'Habilidades Técnicas' : 'Technical Skills' },
        { label: language === 'es' ? 'Resolución de Problemas' : 'Problem Solving' },
        { label: language === 'es' ? 'Comunicación y Colaboración' : 'Communication & Collaboration' },
        { label: language === 'es' ? 'Liderazgo e Iniciativa' : 'Leadership & Initiative' },
        { label: language === 'es' ? 'Afinidad Cultural' : 'Cultural Fit' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Enrich existing manual topics with AI ───
  const handleEnrichTopics = async () => {
    if (topics.length === 0 || !jobTitle.trim()) return;
    setEnriching(true);
    try {
      const response = await fetch('/api/generate-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle,
          description: jobDescription,
          jobType,
          language: generationLanguage,
          customTopics: topics.map(t => ({ label: t.label, weight: t.rubric?.weight })),
        }),
      });
      const data = await response.json();
      if (data.topics && Array.isArray(data.topics)) {
        const enriched: TopicDraft[] = data.topics.map((t: { label: string; rubric?: TopicRubric }) => ({
          label: t.label,
          rubric: t.rubric,
        }));
        setTopics(enriched);
      }
    } catch (error) {
      console.error('Failed to enrich topics:', error);
    } finally {
      setEnriching(false);
    }
  };

  // ─── Add manual topic ───
  const handleAddTopic = () => {
    if (newTopic.trim() && !topics.some(t => t.label === newTopic.trim())) {
      setTopics([...topics, { label: newTopic.trim() }]);
      setNewTopic('');
    }
  };

  const handleRemoveTopic = (index: number) => {
    setTopics(topics.filter((_, i) => i !== index));
    if (expandedTopicIdx === index) setExpandedTopicIdx(null);
  };

  const handleUpdateWeight = (index: number, weight: number) => {
    setTopics(topics.map((t, i) => {
      if (i !== index) return t;
      return {
        ...t,
        rubric: t.rubric ? { ...t.rubric, weight } : { excellent: '', acceptable: '', poor: '', weight },
      };
    }));
  };

  // ─── Save role ───
  const handleSaveRole = () => {
    if (!jobTitle.trim() || topics.length === 0) return;

    const roleTopics: Topic[] = topics.map((t, i) => ({
      id: `t-${Date.now()}-${i}`,
      label: t.label,
      rubric: t.rubric,
    }));

    const newRoleId = `role-${Date.now()}`;
    addRole({
      id: newRoleId,
      title: jobTitle,
      description: jobDescription || undefined,
      jobType: jobType || undefined,
      location: location || undefined,
      salary: salary || undefined,
      topics: roleTopics,
      createdAt: Date.now(),
    });

    if (process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL && candidateEmails.trim()) {
      const candidatesList = candidateEmails
        .split('\n')
        .map(e => e.trim())
        .filter(e => e);
      
      const candidatesPayload = candidatesList.map(email => {
        const nameMatch = email.match(/^([^@]+)/);
        const name = nameMatch ? nameMatch[1] : email;
        return { email, name };
      });

      if (candidatesPayload.length > 0) {
        fetch(process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: newRoleId,
            roleTitle: jobTitle,
            candidates: candidatesPayload,
            language: generationLanguage,
          }),
        }).catch(err => console.error("Webhook failed:", err));
      }
    }

    setSuccess(true);
    setTimeout(() => {
      setJobTitle('');
      setJobDescription('');
      setJobType('');
      setLocation('');
      setSalary('');
      setTopics([]);
      setCandidateEmails('');
      setSuccess(false);
      setShowDescription(false);
    }, 2000);
  };

  const hasTopicsWithRubric = topics.some(t => t.rubric);
  const hasTopicsWithoutRubric = topics.some(t => !t.rubric);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {language === 'es' ? 'Crear Puesto de Entrevista' : 'Create Interview Role'}
        </h1>
        <p className="text-sm text-muted">
          {language === 'es' ? 'Define un nuevo puesto y genera automáticamente una rúbrica de evaluación con IA' : 'Define a new role and auto-generate an evaluation rubric with AI'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form or Upgrade Banner */}
        <div className="lg:col-span-2">
          {planTier === 'starter' && roles.length >= 3 ? (
            <div className="bg-card rounded-2xl shadow-sm border border-[#D3FB52]/30 p-8 md:p-12 text-center relative overflow-hidden">
              <div className="absolute -inset-4 bg-[#D3FB52]/5 rounded-3xl blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-[#D3FB52]/20 flex items-center justify-center text-[#D3FB52] mb-6 shadow-[0_0_30px_rgba(211,251,82,0.3)]">
                  <Crown className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-3">
                  {language === 'es' ? 'Límite de puestos alcanzado' : 'Role limit reached'}
                </h2>
                <p className="text-muted mb-8 max-w-sm mx-auto">
                  {language === 'es' 
                    ? 'Tu plan Starter incluye hasta 3 puestos activos. Sube a Pro para reclutar y entrevistar sin límites.' 
                    : 'Your Starter plan includes up to 3 active roles. Upgrade to Pro to hire and interview without limits.'}
                </p>
                <Link 
                  href="/admin/settings"
                  className="px-6 py-3 rounded-xl font-semibold bg-[#D3FB52] text-black hover:bg-[#c1e847] transition-all shadow-lg shadow-[#D3FB52]/20"
                >
                  {language === 'es' ? 'Ver Planes Premium' : 'View Premium Plans'}
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
              {/* Job Title + Language */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {language === 'es' ? 'Título del Puesto' : 'Job Title'}
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder={language === 'es' ? 'ej. Ingeniero Frontend Senior' : 'e.g., Senior Frontend Engineer'}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm
                        placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                        transition-all"
                    />
                  </div>
                  <select
                    value={generationLanguage}
                    onChange={(e) => setGenerationLanguage(e.target.value as 'es' | 'en')}
                    className="px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
                  >
                    <option value="es">🇲🇽 Español</option>
                    <option value="en">🇺🇸 English</option>
                  </select>
                </div>
              </div>

              {/* Toggle for Description + Details */}
              {!showDescription ? (
                <button
                  onClick={() => setShowDescription(true)}
                  className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-hover transition-colors mb-5"
                >
                  <Plus className="h-3 w-3" />
                  {language === 'es' ? 'Añadir descripción y detalles del puesto (recomendado para mejores resultados)' : 'Add job description & details (recommended for better results)'}
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 mb-5"
                >
                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted" />
                      {language === 'es' ? 'Descripción del Puesto' : 'Job Description'}
                      <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-bold">
                        {language === 'es' ? 'Mejora la IA' : 'Improves AI'}
                      </span>
                    </label>
                    <textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder={language === 'es' 
                        ? 'Describe las responsabilidades, perfil buscado, requisitos y lo que ofreces...' 
                        : 'Describe responsibilities, requirements, benefits, and ideal candidate profile...'}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm
                        placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30
                        transition-all min-h-[120px] resize-y"
                    />
                  </div>

                  {/* Job Type, Location, Salary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {language === 'es' ? 'Tipo' : 'Type'}
                      </label>
                      <select
                        value={jobType}
                        onChange={(e) => setJobType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">{language === 'es' ? 'Seleccionar...' : 'Select...'}</option>
                        <option value="Full Time">{language === 'es' ? 'Tiempo Completo' : 'Full Time'}</option>
                        <option value="Part Time">{language === 'es' ? 'Medio Tiempo' : 'Part Time'}</option>
                        <option value="Contract">{language === 'es' ? 'Contrato' : 'Contract'}</option>
                        <option value="Internship">{language === 'es' ? 'Prácticas' : 'Internship'}</option>
                        <option value="Freelance">Freelance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {language === 'es' ? 'Ubicación' : 'Location'}
                      </label>
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder={language === 'es' ? 'ej. Remoto' : 'e.g. Remote'}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                          placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {language === 'es' ? 'Salario' : 'Salary'}
                      </label>
                      <input
                        value={salary}
                        onChange={(e) => setSalary(e.target.value)}
                        placeholder={language === 'es' ? 'ej. $15,000 MXN' : 'e.g. $5,000 USD'}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                          placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerateRubric}
                disabled={loading || !jobTitle.trim()}
                className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium 
                  transition-all cursor-pointer mb-6 ${
                  loading || !jobTitle.trim()
                    ? 'bg-muted/20 text-muted cursor-not-allowed'
                    : 'bg-primary-light text-primary hover:bg-primary/10'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {language === 'es' ? 'Generando rúbrica con IA...' : 'Generating AI rubric...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {language === 'es' ? 'Generar Rúbrica con IA' : 'Generate AI Rubric'}
                  </>
                )}
              </button>

              {/* Topics */}
              <AnimatePresence>
                {topics.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {/* Topic Header */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-foreground">
                        {language === 'es' ? 'Rúbrica de Evaluación' : 'Evaluation Rubric'} ({topics.length} {language === 'es' ? 'temas' : 'topics'})
                      </h3>
                      {hasTopicsWithoutRubric && (
                        <button
                          onClick={handleEnrichTopics}
                          disabled={enriching || !jobTitle.trim()}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
                        >
                          {enriching ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3" />
                          )}
                          {language === 'es' ? 'Enriquecer con IA' : 'Enrich with AI'}
                        </button>
                      )}
                    </div>

                    {/* Topic Cards */}
                    <div className="space-y-2 mb-4">
                      {topics.map((topic, index) => (
                        <TopicCard
                          key={`${topic.label}-${index}`}
                          topic={topic}
                          index={index}
                          onRemove={() => handleRemoveTopic(index)}
                          onUpdateWeight={(w) => handleUpdateWeight(index, w)}
                          expanded={expandedTopicIdx === index}
                          onToggle={() => setExpandedTopicIdx(expandedTopicIdx === index ? null : index)}
                        />
                      ))}
                    </div>

                    {/* Add custom topic */}
                    <div className="flex gap-2 mb-6">
                      <input
                        type="text"
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                        placeholder={language === 'es' ? 'Añadir tema manual...' : 'Add a custom topic...'}
                        className="flex-1 px-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm
                          placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={handleAddTopic}
                        className="px-4 py-2 rounded-xl bg-background border border-border text-foreground text-sm
                          hover:bg-primary-light hover:text-primary hover:border-primary/20 transition-all cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mb-6 pt-4 border-t border-border/30">
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        {language === 'es' ? 'Correos de candidatos (uno por línea)' : 'Candidate emails (one per line)'}
                      </label>
                      <textarea
                        value={candidateEmails}
                        onChange={(e) => setCandidateEmails(e.target.value)}
                        placeholder="juan@email.com&#10;maria@email.com&#10;carlos@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm
                          placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[100px] resize-y"
                      />
                      <p className="text-xs text-muted mt-1">
                        {language === 'es' ? 'Se enviará un link único a cada correo automáticamente' : 'A unique link will be sent to each email automatically'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex items-center justify-between border-t border-border/30">
                      <button
                        onClick={() => { setTopics([]); setJobTitle(''); setJobDescription(''); setJobType(''); setLocation(''); setSalary(''); setCandidateEmails(''); setShowDescription(false); }}
                        className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                      >
                        {language === 'es' ? 'Limpiar' : 'Clear Form'}
                      </button>

                      {success ? (
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm bg-success text-white"
                        >
                          ✓ {language === 'es' ? '¡Puesto Creado!' : 'Role Created!'}
                        </motion.div>
                      ) : (
                        <button
                          onClick={handleSaveRole}
                          disabled={!jobTitle.trim() || topics.length === 0}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm text-foreground bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <Plus className="h-4 w-4" />
                          {language === 'es' ? 'Crear Puesto Activo' : 'Create Active Role'}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Existing Roles */}
        <div>
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">
              {language === 'es' ? 'Puestos Existentes' : 'Existing Roles'} ({roles.length})
            </h3>
            {roles.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-8 w-8 text-muted/30 mx-auto mb-3" />
                <p className="text-xs text-muted">
                  {language === 'es' ? 'Aún no has creado puestos. ¡Crea tu primero con IA!' : 'No roles yet. Create your first one with AI!'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className="rounded-xl bg-background border border-border/50 overflow-hidden"
                  >
                    <div 
                      className="p-3 cursor-pointer hover:bg-muted/5 transition-colors flex justify-between items-center"
                      onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {role.title}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {role.topics.length} {language === 'es' ? 'temas' : 'topics'} •{' '}
                          {new Date(role.createdAt).toLocaleDateString()}
                          {role.topics.some(t => t.rubric) && (
                            <span className="ml-1.5 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                              AI Rubric
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedRoleId === role.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <RoleEditor 
                            role={role} 
                            onRemove={() => {
                              if(confirm(language === 'es' ? '¿Eliminar este puesto?' : 'Delete this role?')) {
                                removeRole(role.id);
                                setExpandedRoleId(null);
                              }
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
