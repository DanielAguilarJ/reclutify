'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, X, Plus, Loader2, GraduationCap, BookOpen,
  ArrowUp, ArrowDown, DollarSign, Users, Clock, Star,
  Target, MessageSquare, Shield, Zap, Upload, FileText, CheckCircle2,
} from 'lucide-react';
import { useCoachStore } from '@/store/coachStore';
import { useAppStore } from '@/store/appStore';
import type { Course, CourseModule, CoursePlan } from '@/types/informes';

// ─── Module Draft (local state) ───
interface ModuleDraft {
  id: string;
  title: string;
  description: string;
}

// ─── Plan Draft (local state) ───
interface PlanDraft {
  id: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  isRecommended: boolean;
}

// ─── Objection pair (local state) ───
interface ObjectionPair {
  trigger: string;
  response: string;
}

export default function CreateCoursePage() {
  const { addCourse } = useCoachStore();
  const { language } = useAppStore();

  // ─── Basic info ───
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [durationInfo, setDurationInfo] = useState('');
  const [modality, setModality] = useState<'presencial' | 'online' | 'hibrido'>('online');
  const [sessionDuration, setSessionDuration] = useState(20);
  const [isActive, setIsActive] = useState(false);

  // ─── Array fields ───
  const [objectives, setObjectives] = useState<string[]>([]);
  const [newObjective, setNewObjective] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState('');
  const [testimonials, setTestimonials] = useState<string[]>([]);
  const [newTestimonial, setNewTestimonial] = useState('');
  const [urgencyHooks, setUrgencyHooks] = useState<string[]>([]);
  const [newUrgencyHook, setNewUrgencyHook] = useState('');

  // ─── Modules ───
  const [modules, setModules] = useState<ModuleDraft[]>([]);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  // ─── Plans ───
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState(0);
  const [newPlanCurrency, setNewPlanCurrency] = useState('MXN');
  const [newPlanFeature, setNewPlanFeature] = useState('');
  const [newPlanFeatures, setNewPlanFeatures] = useState<string[]>([]);
  const [newPlanRecommended, setNewPlanRecommended] = useState(false);

  // ─── Objection responses ───
  const [objections, setObjections] = useState<ObjectionPair[]>([]);
  const [newObjTrigger, setNewObjTrigger] = useState('');
  const [newObjResponse, setNewObjResponse] = useState('');

  // ─── UI states ───
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState(false);

  // ─── File Upload states ───
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<Record<string, number> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── File Upload Handler ───
  const handleFileUpload = useCallback(async (file: File) => {
    setUploadLoading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setUploadSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-course-document', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setUploadError(result.error || 'Error al procesar el documento');
        return;
      }

      const data = result.data;

      // Auto-fill all form fields with extracted data
      if (data.name) setName(data.name);
      if (data.description) setDescription(data.description);
      if (data.targetAudience) setTargetAudience(data.targetAudience);
      if (data.durationInfo) setDurationInfo(data.durationInfo);
      if (data.modality) setModality(data.modality);
      if (data.sessionDuration) setSessionDuration(data.sessionDuration);
      if (data.objectives?.length) setObjectives(data.objectives);
      if (data.benefits?.length) setBenefits(data.benefits);
      if (data.testimonials?.length) setTestimonials(data.testimonials);
      if (data.urgencyHooks?.length) setUrgencyHooks(data.urgencyHooks);

      // Modules
      if (data.modules?.length) {
        setModules(data.modules.map((m: { title: string; description: string }) => ({
          id: crypto.randomUUID(),
          title: m.title,
          description: m.description || '',
        })));
      }

      // Plans
      if (data.plans?.length) {
        setPlans(data.plans.map((p: { name: string; price: number; currency: string; features: string[]; isRecommended: boolean }) => ({
          id: crypto.randomUUID(),
          name: p.name,
          price: p.price,
          currency: p.currency || 'MXN',
          features: p.features || [],
          isRecommended: p.isRecommended || false,
        })));
      }

      // Objection responses
      if (data.objectionResponses && Object.keys(data.objectionResponses).length > 0) {
        setObjections(
          Object.entries(data.objectionResponses).map(([trigger, response]) => ({
            trigger,
            response: response as string,
          }))
        );
      }

      setUploadSuccess(true);
      setUploadSummary(result.summary);
    } catch (err) {
      setUploadError('Error de conexión. Intenta de nuevo.');
      console.error('[upload]', err);
    } finally {
      setUploadLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // ─── Helpers: Arrays ───
  const addToArray = (arr: string[], setter: (v: string[]) => void, value: string, inputSetter: (v: string) => void) => {
    if (value.trim() && !arr.includes(value.trim())) {
      setter([...arr, value.trim()]);
      inputSetter('');
    }
  };

  const removeFromArray = (arr: string[], setter: (v: string[]) => void, index: number) => {
    setter(arr.filter((_, i) => i !== index));
  };

  // ─── Module handlers ───
  const handleAddModule = () => {
    if (!newModuleTitle.trim()) return;
    setModules([...modules, {
      id: crypto.randomUUID(),
      title: newModuleTitle.trim(),
      description: newModuleDesc.trim(),
    }]);
    setNewModuleTitle('');
    setNewModuleDesc('');
  };

  const handleRemoveModule = (id: string) => {
    setModules(modules.filter(m => m.id !== id));
  };

  const handleMoveModule = (index: number, direction: 'up' | 'down') => {
    const arr = [...modules];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    setModules(arr);
  };

  // ─── Plan handlers ───
  const handleAddPlanFeature = () => {
    if (newPlanFeature.trim() && !newPlanFeatures.includes(newPlanFeature.trim())) {
      setNewPlanFeatures([...newPlanFeatures, newPlanFeature.trim()]);
      setNewPlanFeature('');
    }
  };

  const handleAddPlan = () => {
    if (!newPlanName.trim() || newPlanPrice <= 0) return;
    setPlans([...plans, {
      id: crypto.randomUUID(),
      name: newPlanName.trim(),
      price: newPlanPrice,
      currency: newPlanCurrency,
      features: [...newPlanFeatures],
      isRecommended: newPlanRecommended,
    }]);
    setNewPlanName('');
    setNewPlanPrice(0);
    setNewPlanFeatures([]);
    setNewPlanRecommended(false);
  };

  const handleRemovePlan = (id: string) => {
    setPlans(plans.filter(p => p.id !== id));
  };

  // ─── Objection handlers ───
  const handleAddObjection = () => {
    if (!newObjTrigger.trim() || !newObjResponse.trim()) return;
    setObjections([...objections, { trigger: newObjTrigger.trim(), response: newObjResponse.trim() }]);
    setNewObjTrigger('');
    setNewObjResponse('');
  };

  const handleRemoveObjection = (index: number) => {
    setObjections(objections.filter((_, i) => i !== index));
  };

  // ─── AI Generate Topics ───
  const handleGenerateTopics = async () => {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      const response = await fetch('/api/generate-course-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          objectives,
          benefits,
          modules: modules.map((m, i) => ({ title: m.title, description: m.description, orderIndex: i })),
          plans: plans.map(p => ({ name: p.name, price: p.price, currency: p.currency, features: p.features })),
          targetAudience,
        }),
      });
      const data = await response.json();
      if (data.topics && Array.isArray(data.topics)) {
        // Topics generated successfully - they will be stored with the course
        handleSave(data.topics);
        return;
      }
    } catch (error) {
      console.error('Failed to generate topics:', error);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Save Course ───
  const handleSave = async (generatedTopics?: unknown[]) => {
    if (!name.trim()) return;
    setLoading(true);

    try {
      const courseId = crypto.randomUUID();
      const now = Date.now();

      const objectionResponses: Record<string, string> = {};
      objections.forEach(obj => {
        objectionResponses[obj.trigger] = obj.response;
      });

      const course: Course = {
        id: courseId,
        orgId: '', // Will be set by the store from its orgId state
        name: name.trim(),
        description: description.trim(),
        objectives,
        benefits,
        targetAudience: targetAudience.trim(),
        durationInfo: durationInfo.trim(),
        modality,
        sessionDuration,
        topics: (generatedTopics as Course['topics']) || [],
        objectionResponses,
        testimonials,
        urgencyHooks,
        isActive,
        createdAt: now,
        updatedAt: now,
      };

      const courseModules: CourseModule[] = modules.map((m, i) => ({
        id: m.id,
        courseId,
        title: m.title,
        description: m.description,
        orderIndex: i,
      }));

      const coursePlans: CoursePlan[] = plans.map((p, i) => ({
        id: p.id,
        courseId,
        name: p.name,
        price: p.price,
        currency: p.currency,
        features: p.features,
        isRecommended: p.isRecommended,
        orderIndex: i,
      }));

      await addCourse(course, courseModules, coursePlans);

      setSuccess(true);
      setTimeout(() => {
        setName('');
        setDescription('');
        setTargetAudience('');
        setDurationInfo('');
        setModality('online');
        setSessionDuration(20);
        setIsActive(false);
        setObjectives([]);
        setBenefits([]);
        setTestimonials([]);
        setUrgencyHooks([]);
        setModules([]);
        setPlans([]);
        setObjections([]);
        setSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to save course:', error);
    } finally {
      setLoading(false);
    }
  };

  const canSave = name.trim().length > 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {language === 'es' ? 'Crear Curso / Programa' : 'Create Course / Program'}
        </h1>
        <p className="text-sm text-muted">
          {language === 'es'
            ? 'Define tu curso y la IA generara automaticamente los temas de conversacion para las sesiones de informes'
            : 'Define your course and AI will auto-generate conversational topics for info sessions'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Main Form ─── */}
        <div className="lg:col-span-2 space-y-6">

          {/* ─── Document Upload Card ─── */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Rellena con IA desde un documento' : 'Auto-fill with AI from a document'}
            </h2>
            <p className="text-xs text-muted mb-4">
              {language === 'es'
                ? 'Sube un PDF, Word o TXT con la informacion del curso y la IA extraera todos los datos automaticamente.'
                : 'Upload a PDF, Word or TXT with course information and AI will extract all data automatically.'}
            </p>

            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploadLoading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#D3FB52] bg-[#D3FB52]/5 scale-[1.01]'
                  : uploadLoading
                  ? 'border-border/50 bg-background/50 cursor-wait'
                  : 'border-border/50 hover:border-[#D3FB52]/50 hover:bg-[#D3FB52]/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
                disabled={uploadLoading}
              />

              {uploadLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 text-[#D3FB52] animate-spin" />
                  <p className="text-sm font-medium text-foreground">Procesando documento con IA...</p>
                  <p className="text-xs text-muted">Esto puede tomar unos segundos</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#D3FB52]/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-[#D3FB52]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {isDragging
                        ? (language === 'es' ? 'Suelta el archivo aqui' : 'Drop file here')
                        : (language === 'es' ? 'Arrastra un archivo aqui o haz click para seleccionar' : 'Drag a file here or click to select')}
                    </p>
                    <p className="text-xs text-muted mt-1">PDF, Word (.docx) o texto plano (.txt) — Max 15 MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Error */}
            {uploadError && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
                <X className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-500">{uploadError}</p>
              </div>
            )}

            {/* Upload Success */}
            {uploadSuccess && uploadSummary && (
              <div className="mt-3 p-4 bg-[#D3FB52]/10 border border-[#D3FB52]/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-[#D3FB52]" />
                  <p className="text-sm font-medium text-foreground">
                    {language === 'es' ? 'Documento procesado exitosamente' : 'Document processed successfully'}
                  </p>
                </div>
                <p className="text-xs text-muted">
                  {language === 'es' ? 'Se extrajeron: ' : 'Extracted: '}
                  {uploadSummary.objectives > 0 && `${uploadSummary.objectives} objetivos, `}
                  {uploadSummary.benefits > 0 && `${uploadSummary.benefits} beneficios, `}
                  {uploadSummary.modules > 0 && `${uploadSummary.modules} modulos, `}
                  {uploadSummary.plans > 0 && `${uploadSummary.plans} planes, `}
                  {uploadSummary.testimonials > 0 && `${uploadSummary.testimonials} testimonios, `}
                  {uploadSummary.objectionResponses > 0 && `${uploadSummary.objectionResponses} objeciones`}
                  {'. '}
                  {language === 'es' ? 'Revisa y ajusta los datos antes de guardar.' : 'Review and adjust data before saving.'}
                </p>
              </div>
            )}
          </div>

          {/* Basic Info Card */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Informacion Basica' : 'Basic Information'}
            </h2>

            {/* Course Name */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted mb-1.5">
                {language === 'es' ? 'Nombre del Curso' : 'Course Name'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={language === 'es' ? 'ej. Programa de Liderazgo Transformacional' : 'e.g. Transformational Leadership Program'}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm
                  placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30 focus:border-[#D3FB52]
                  transition-all"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted mb-1.5">
                {language === 'es' ? 'Descripcion' : 'Description'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={language === 'es'
                  ? 'Describe tu curso, que aprenderan los alumnos, que transformacion ofreces...'
                  : 'Describe your course, what students will learn, what transformation you offer...'}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm
                  placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30
                  transition-all min-h-[120px] resize-y"
              />
            </div>

            {/* Target Audience + Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {language === 'es' ? 'Publico Objetivo' : 'Target Audience'}
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder={language === 'es' ? 'ej. Emprendedores, lideres de equipo' : 'e.g. Entrepreneurs, team leaders'}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                    placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {language === 'es' ? 'Duracion del Programa' : 'Program Duration'}
                </label>
                <input
                  type="text"
                  value={durationInfo}
                  onChange={(e) => setDurationInfo(e.target.value)}
                  placeholder={language === 'es' ? 'ej. 8 semanas' : 'e.g. 8 weeks'}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                    placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30"
                />
              </div>
            </div>

            {/* Modality + Session Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  {language === 'es' ? 'Modalidad' : 'Modality'}
                </label>
                <div className="flex gap-2">
                  {(['presencial', 'online', 'hibrido'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModality(m)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        modality === m
                          ? 'bg-[#D3FB52] text-black border-[#D3FB52] shadow-sm'
                          : 'bg-background border-border text-muted hover:border-[#D3FB52]/30 hover:text-foreground'
                      }`}
                    >
                      {m === 'presencial' ? (language === 'es' ? 'Presencial' : 'In-Person')
                        : m === 'online' ? 'Online'
                        : (language === 'es' ? 'Hibrido' : 'Hybrid')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {language === 'es' ? 'Duracion Sesion Informes (min)' : 'Info Session Duration (min)'}
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(Math.max(5, Math.min(60, Number(e.target.value) || 20)))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm
                    focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30"
                />
              </div>
            </div>
          </div>

          {/* Objectives */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Objetivos del Curso' : 'Course Objectives'}
            </h2>
            <div className="space-y-2 mb-3">
              <AnimatePresence>
                {objectives.map((obj, i) => (
                  <motion.div
                    key={`obj-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/50"
                  >
                    <span className="text-xs text-foreground flex-1">{obj}</span>
                    <button
                      onClick={() => removeFromArray(objectives, setObjectives, i)}
                      className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToArray(objectives, setObjectives, newObjective, setNewObjective)}
                placeholder={language === 'es' ? 'Agregar objetivo...' : 'Add objective...'}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <button
                onClick={() => addToArray(objectives, setObjectives, newObjective, setNewObjective)}
                disabled={!newObjective.trim()}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground
                  hover:bg-[#D3FB52]/10 hover:border-[#D3FB52]/30 transition-all disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Beneficios' : 'Benefits'}
            </h2>
            <div className="space-y-2 mb-3">
              <AnimatePresence>
                {benefits.map((ben, i) => (
                  <motion.div
                    key={`ben-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/50"
                  >
                    <span className="text-xs text-foreground flex-1">{ben}</span>
                    <button
                      onClick={() => removeFromArray(benefits, setBenefits, i)}
                      className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBenefit}
                onChange={(e) => setNewBenefit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToArray(benefits, setBenefits, newBenefit, setNewBenefit)}
                placeholder={language === 'es' ? 'Agregar beneficio...' : 'Add benefit...'}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <button
                onClick={() => addToArray(benefits, setBenefits, newBenefit, setNewBenefit)}
                disabled={!newBenefit.trim()}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground
                  hover:bg-[#D3FB52]/10 hover:border-[#D3FB52]/30 transition-all disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Modules */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Modulos del Programa' : 'Program Modules'}
              <span className="text-[10px] text-muted">({modules.length})</span>
            </h2>
            <div className="space-y-2 mb-4">
              <AnimatePresence>
                {modules.map((mod, i) => (
                  <motion.div
                    key={mod.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-start gap-2 px-3 py-3 rounded-lg bg-background border border-border/50"
                  >
                    <div className="flex flex-col gap-0.5 mt-1">
                      <button
                        onClick={() => handleMoveModule(i, 'up')}
                        disabled={i === 0}
                        className="p-0.5 text-muted hover:text-foreground disabled:opacity-20 transition-colors"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleMoveModule(i, 'down')}
                        disabled={i === modules.length - 1}
                        className="p-0.5 text-muted hover:text-foreground disabled:opacity-20 transition-colors"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-foreground block">{mod.title}</span>
                      {mod.description && (
                        <span className="text-[11px] text-muted block mt-0.5">{mod.description}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveModule(mod.id)}
                      className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors mt-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/5">
              <input
                type="text"
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                placeholder={language === 'es' ? 'Titulo del modulo...' : 'Module title...'}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <textarea
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                placeholder={language === 'es' ? 'Descripcion breve (opcional)...' : 'Brief description (optional)...'}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30 min-h-[60px] resize-y"
              />
              <button
                onClick={handleAddModule}
                disabled={!newModuleTitle.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-[#D3FB52]/10 text-[#8ab02e] hover:bg-[#D3FB52]/20 transition-all disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {language === 'es' ? 'Agregar Modulo' : 'Add Module'}
              </button>
            </div>
          </div>

          {/* Plans */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Planes / Precios' : 'Plans / Pricing'}
              <span className="text-[10px] text-muted">({plans.length})</span>
            </h2>
            <div className="space-y-3 mb-4">
              <AnimatePresence>
                {plans.map((plan) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`px-4 py-3 rounded-lg border ${
                      plan.isRecommended
                        ? 'border-[#D3FB52]/50 bg-[#D3FB52]/5'
                        : 'border-border/50 bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{plan.name}</span>
                        {plan.isRecommended && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#D3FB52] text-black">
                            {language === 'es' ? 'RECOMENDADO' : 'RECOMMENDED'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          ${plan.price.toLocaleString()} {plan.currency}
                        </span>
                        <button
                          onClick={() => handleRemovePlan(plan.id)}
                          className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {plan.features.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {plan.features.map((f, fi) => (
                          <span key={fi} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/10 text-muted">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add plan form */}
            <div className="space-y-3 p-3 rounded-lg border border-dashed border-border/60 bg-muted/5">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder={language === 'es' ? 'Nombre del plan' : 'Plan name'}
                  className="col-span-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                    placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
                />
                <input
                  type="number"
                  min={0}
                  value={newPlanPrice || ''}
                  onChange={(e) => setNewPlanPrice(Number(e.target.value) || 0)}
                  placeholder={language === 'es' ? 'Precio' : 'Price'}
                  className="col-span-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                    placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
                />
                <select
                  value={newPlanCurrency}
                  onChange={(e) => setNewPlanCurrency(e.target.value)}
                  className="col-span-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                    focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="COP">COP</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>

              {/* Plan features */}
              <div className="space-y-1.5">
                {newPlanFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className="w-1 h-1 rounded-full bg-[#D3FB52]" />
                    {f}
                    <button onClick={() => setNewPlanFeatures(newPlanFeatures.filter((_, fi) => fi !== i))} className="ml-auto text-danger/60 hover:text-danger">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newPlanFeature}
                    onChange={(e) => setNewPlanFeature(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPlanFeature()}
                    placeholder={language === 'es' ? 'Agregar feature...' : 'Add feature...'}
                    className="flex-1 px-2 py-1 rounded border border-border bg-background text-[10px]
                      placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
                  />
                  <button onClick={handleAddPlanFeature} disabled={!newPlanFeature.trim()} className="text-muted hover:text-foreground disabled:opacity-30">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPlanRecommended}
                    onChange={(e) => setNewPlanRecommended(e.target.checked)}
                    className="rounded border-border accent-[#D3FB52]"
                  />
                  {language === 'es' ? 'Marcar como recomendado' : 'Mark as recommended'}
                </label>
              </div>

              <button
                onClick={handleAddPlan}
                disabled={!newPlanName.trim() || newPlanPrice <= 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-[#D3FB52]/10 text-[#8ab02e] hover:bg-[#D3FB52]/20 transition-all disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {language === 'es' ? 'Agregar Plan' : 'Add Plan'}
              </button>
            </div>
          </div>

          {/* Testimonials */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Testimonios' : 'Testimonials'}
            </h2>
            <div className="space-y-2 mb-3">
              <AnimatePresence>
                {testimonials.map((t, i) => (
                  <motion.div
                    key={`test-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-background border border-border/50"
                  >
                    <span className="text-xs text-foreground flex-1 italic">&ldquo;{t}&rdquo;</span>
                    <button
                      onClick={() => removeFromArray(testimonials, setTestimonials, i)}
                      className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTestimonial}
                onChange={(e) => setNewTestimonial(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToArray(testimonials, setTestimonials, newTestimonial, setNewTestimonial)}
                placeholder={language === 'es' ? 'Agregar testimonio...' : 'Add testimonial...'}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <button
                onClick={() => addToArray(testimonials, setTestimonials, newTestimonial, setNewTestimonial)}
                disabled={!newTestimonial.trim()}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground
                  hover:bg-[#D3FB52]/10 hover:border-[#D3FB52]/30 transition-all disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Urgency Hooks */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Ganchos de Urgencia' : 'Urgency Hooks'}
            </h2>
            <p className="text-[10px] text-muted mb-3">
              {language === 'es'
                ? 'Frases que la IA usara para crear urgencia durante la sesion de informes'
                : 'Phrases the AI will use to create urgency during info sessions'}
            </p>
            <div className="space-y-2 mb-3">
              <AnimatePresence>
                {urgencyHooks.map((h, i) => (
                  <motion.div
                    key={`urg-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/50"
                  >
                    <Zap className="h-3 w-3 text-[#D3FB52] shrink-0" />
                    <span className="text-xs text-foreground flex-1">{h}</span>
                    <button
                      onClick={() => removeFromArray(urgencyHooks, setUrgencyHooks, i)}
                      className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newUrgencyHook}
                onChange={(e) => setNewUrgencyHook(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToArray(urgencyHooks, setUrgencyHooks, newUrgencyHook, setNewUrgencyHook)}
                placeholder={language === 'es' ? 'ej. Solo quedan 5 lugares' : 'e.g. Only 5 spots left'}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <button
                onClick={() => addToArray(urgencyHooks, setUrgencyHooks, newUrgencyHook, setNewUrgencyHook)}
                disabled={!newUrgencyHook.trim()}
                className="px-3 py-2 rounded-lg bg-background border border-border text-foreground
                  hover:bg-[#D3FB52]/10 hover:border-[#D3FB52]/30 transition-all disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Objection Responses */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#D3FB52]" />
              {language === 'es' ? 'Respuestas a Objeciones' : 'Objection Responses'}
            </h2>
            <p className="text-[10px] text-muted mb-3">
              {language === 'es'
                ? 'Define como la IA debe responder a objeciones comunes del cliente'
                : 'Define how the AI should respond to common client objections'}
            </p>
            <div className="space-y-2 mb-4">
              <AnimatePresence>
                {objections.map((obj, i) => (
                  <motion.div
                    key={`obj-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="px-3 py-2.5 rounded-lg bg-background border border-border/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-danger/70 block mb-0.5">
                          {language === 'es' ? 'Objecion' : 'Objection'}: {obj.trigger}
                        </span>
                        <span className="text-xs text-foreground block">{obj.response}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveObjection(i)}
                        className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="space-y-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/5">
              <input
                type="text"
                value={newObjTrigger}
                onChange={(e) => setNewObjTrigger(e.target.value)}
                placeholder={language === 'es' ? 'Tipo de objecion (ej. precio, tiempo, dudas)' : 'Objection type (e.g. price, time, doubts)'}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30"
              />
              <textarea
                value={newObjResponse}
                onChange={(e) => setNewObjResponse(e.target.value)}
                placeholder={language === 'es' ? 'Respuesta sugerida para la IA...' : 'Suggested AI response...'}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs
                  placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-[#D3FB52]/30 min-h-[60px] resize-y"
              />
              <button
                onClick={handleAddObjection}
                disabled={!newObjTrigger.trim() || !newObjResponse.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-[#D3FB52]/10 text-[#8ab02e] hover:bg-[#D3FB52]/20 transition-all disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                {language === 'es' ? 'Agregar Objecion' : 'Add Objection'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Sidebar: Actions & Preview ─── */}
        <div className="space-y-4">
          {/* Active Toggle */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">
                {language === 'es' ? 'Curso Activo' : 'Course Active'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 cursor-pointer ${
                  isActive ? 'bg-[#D3FB52]' : 'bg-muted/30'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    isActive ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-muted">
              {language === 'es'
                ? 'Los clientes podran acceder a sesiones de informes de este curso'
                : 'Clients will be able to access info sessions for this course'}
            </p>
          </div>

          {/* AI Generate Button */}
          <div className="bg-card rounded-2xl shadow-sm border border-[#D3FB52]/30 p-5">
            <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#D3FB52]" />
              {language === 'es' ? 'Generar Temas con IA' : 'Generate Topics with AI'}
            </h3>
            <p className="text-[10px] text-muted mb-3">
              {language === 'es'
                ? 'La IA creara automaticamente los temas de conversacion y puntos clave para las sesiones de informes basandose en los datos del curso.'
                : 'AI will automatically create conversational topics and key talking points for info sessions based on course data.'}
            </p>
            <button
              onClick={handleGenerateTopics}
              disabled={generating || !name.trim()}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
                generating || !name.trim()
                  ? 'bg-muted/20 text-muted cursor-not-allowed'
                  : 'bg-[#D3FB52] text-black hover:bg-[#c1e847] shadow-sm'
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {language === 'es' ? 'Generando...' : 'Generating...'}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {language === 'es' ? 'Generar y Guardar' : 'Generate & Save'}
                </>
              )}
            </button>
          </div>

          {/* Save Button */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
            {success ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-xs bg-success text-white"
              >
                {language === 'es' ? 'Curso Creado!' : 'Course Created!'}
              </motion.div>
            ) : (
              <button
                onClick={() => handleSave()}
                disabled={!canSave || loading}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  !canSave || loading
                    ? 'bg-muted/20 text-muted cursor-not-allowed'
                    : 'bg-foreground text-background hover:opacity-90'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {language === 'es' ? 'Guardando...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    {language === 'es' ? 'Guardar Curso (sin IA)' : 'Save Course (no AI)'}
                  </>
                )}
              </button>
            )}
            <p className="text-[10px] text-muted mt-2 text-center">
              {language === 'es'
                ? 'Guarda sin generar temas de IA. Puedes generarlos despues.'
                : 'Save without AI topic generation. You can generate them later.'}
            </p>
          </div>

          {/* Summary Card */}
          <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
            <h3 className="text-xs font-semibold text-foreground mb-3">
              {language === 'es' ? 'Resumen' : 'Summary'}
            </h3>
            <div className="space-y-2 text-[11px] text-muted">
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Objetivos' : 'Objectives'}</span>
                <span className="font-medium text-foreground">{objectives.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Beneficios' : 'Benefits'}</span>
                <span className="font-medium text-foreground">{benefits.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Modulos' : 'Modules'}</span>
                <span className="font-medium text-foreground">{modules.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Planes' : 'Plans'}</span>
                <span className="font-medium text-foreground">{plans.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Testimonios' : 'Testimonials'}</span>
                <span className="font-medium text-foreground">{testimonials.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Objeciones' : 'Objections'}</span>
                <span className="font-medium text-foreground">{objections.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{language === 'es' ? 'Ganchos urgencia' : 'Urgency hooks'}</span>
                <span className="font-medium text-foreground">{urgencyHooks.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
