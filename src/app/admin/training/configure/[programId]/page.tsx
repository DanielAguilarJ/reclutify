'use client';

import { use, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  FileText,
  File,
  Trash2,
  Plus,
  Sparkles,
  Loader2,
  Clock,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle,
  AlertCircle,
  Globe,
  Briefcase,
  FileWarning
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';
import type { TrainingModule, TrainingDocument, TrainingProgram, TrainingProgramStatus } from '@/types';

export default function ConfigureProgramPage(props: { params: Promise<{ programId: string }> }) {
  const { programId } = use(props.params);
  const { language } = useAppStore();
  const router = useRouter();
  const {
    updateProgram,
    addModule,
    updateModule,
    removeModule,
    detachDocumentFromProgram,
    setError
  } = useTrainingAdminStore();

  // Program & UI state loaded from GET /api/training/programs/[programId]
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [role, setRole] = useState<{ id: string; title: string } | null>(null);
  
  // Document library states
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<TrainingDocument[]>([]);

  const [modules, setModules] = useState<TrainingModule[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [aiPersonality, setAiPersonality] = useState('friendly_mentor');
  const [passingScore, setPassingScore] = useState(70);
  const [status, setStatus] = useState<TrainingProgramStatus>('draft');

  // Document states
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [docScope, setDocScope] = useState<'role' | 'organization'>('role');
  const [isDragging, setIsDragging] = useState(false);
  const [parsingDocs, setParsingDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Module states
  const [generatingModules, setGeneratingModules] = useState(false);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Determinar si el programa es de solo lectura (todo excepto borrador es read-only)
  const isReadOnly = program ? program.status !== 'draft' : false;

  // La generación con IA solo usa documentos ya procesados (status 'ready');
  // el backend rechaza la llamada si ninguno lo está.
  const readyDocumentsCount = documents.filter((doc) => doc.status === 'ready').length;

  // Load program details
  const loadProgramDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/training/programs/${programId}`);
      if (!res.ok) throw new Error('Failed to load program details');
      const data = await res.json();
      if (data.program) {
        setProgram(data.program);
        setRole(data.role);
        setModules(data.modules || []);

        // Initialize form
        setTitle(data.program.title || '');
        setDescription(data.program.description || '');
        setWelcomeMessage(data.program.welcomeMessage || '');
        setAiPersonality(data.program.aiPersonality || 'friendly_mentor');
        setPassingScore(data.program.passingScore ?? 70);
        setStatus(data.program.status || 'draft');
      }
      
      // Cargar documentos desde biblioteca (asociados y disponibles)
      await loadLibraryDocuments();
    } catch (err: any) {
      setError(err.message || 'Error loading program details');
      showToast('error', language === 'es' ? 'Error al cargar detalles' : 'Error loading details');
    } finally {
      setLoading(false);
    }
  };

  const loadLibraryDocuments = async () => {
    try {
      const res = await fetch(`/api/training/programs/${programId}/documents`);
      if (!res.ok) throw new Error('Failed to load documents library');
      const data = await res.json();
      setDocuments(data.attached || []);
      setAvailableDocuments(data.available || []);
    } catch (err: any) {
      console.error('Failed to load program documents:', err);
    }
  };

  useEffect(() => {
    loadProgramDetails();
  }, [programId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.type === 'text/plain' ||
        f.name.endsWith('.md')
    );
    setUploadFiles((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadFiles((prev) => [...prev, ...files]);
    }
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileTypeLabel = (type: string) => {
    if (type === 'application/pdf') return 'PDF';
    if (type.includes('wordprocessingml')) return 'DOCX';
    if (type === 'text/plain' || type === 'text/markdown') return 'TXT';
    return 'FILE';
  };

  const getFileTypeBadgeColor = (type: string) => {
    if (type === 'application/pdf') return 'bg-red-100 text-red-700';
    if (type.includes('wordprocessingml')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  // Parse and upload documents
  const handleParseDocuments = async () => {
    if (isReadOnly || uploadFiles.length === 0) return;
    setParsingDocs(true);
    try {
      const formData = new FormData();
      formData.append('programId', programId);
      formData.append('scope', docScope);
      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch('/api/training/documents', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to upload documents');
      }

      await loadLibraryDocuments();
      setUploadFiles([]);
      showToast('success', language === 'es' ? 'Documentos cargados y procesados' : 'Documents uploaded and processed');
    } catch (err: any) {
      showToast('error', err.message || (language === 'es' ? 'Error al procesar documentos' : 'Error processing documents'));
    } finally {
      setParsingDocs(false);
    }
  };

  // Attach a reusable document from library
  const handleAttachDocument = async (docId: string) => {
    if (isReadOnly) return;
    try {
      const res = await fetch(`/api/training/programs/${programId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, required: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to associate document');
      }

      await loadLibraryDocuments();
      showToast('success', language === 'es' ? 'Documento asociado correctamente' : 'Document associated successfully');
    } catch (err: any) {
      showToast('error', err.message || 'Error');
    }
  };

  // Remove document association
  const handleRemoveDocument = async (docId: string) => {
    if (isReadOnly) return;
    const success = await detachDocumentFromProgram(programId, docId);
    if (success) {
      await loadLibraryDocuments();
      showToast('success', language === 'es' ? 'Asociación de documento eliminada' : 'Document association removed');
    } else {
      showToast('error', language === 'es' ? 'Error al desvincular documento' : 'Error detaching document');
    }
  };

  // Generate modules with AI
  const handleGenerateModules = async () => {
    if (isReadOnly || readyDocumentsCount === 0) return;
    setGeneratingModules(true);
    try {
      const res = await fetch('/api/training/generate-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to generate modules');
      }

      const data = await res.json();
      if (data.modules && Array.isArray(data.modules)) {
        setModules(data.modules);
        showToast('success', language === 'es' ? 'Módulos generados con éxito' : 'Modules generated successfully');
      }
    } catch (err: any) {
      showToast('error', err.message || (language === 'es' ? 'Error al generar módulos' : 'Error generating modules'));
    } finally {
      setGeneratingModules(false);
    }
  };

  // Add manual module
  const handleAddManualModule = async () => {
    if (isReadOnly) return;
    const manualPayload = {
      title: language === 'es' ? 'Nuevo Módulo' : 'New Module',
      description: '',
      content: { sections: [] },
      sourceDocumentIds: [],
      durationEstimate: 15,
      evaluationEnabled: false,
      evaluationQuestions: [],
    };

    const newMod = await addModule(programId, manualPayload);
    if (newMod) {
      setModules((prev) => [...prev, newMod]);
      setExpandedModuleId(newMod.id);
      showToast('success', language === 'es' ? 'Módulo creado' : 'Module created');
    } else {
      showToast('error', language === 'es' ? 'Error al crear módulo' : 'Error creating module');
    }
  };

  const handleToggleEvaluation = async (moduleId: string, enabled: boolean) => {
    if (isReadOnly) return;
    const success = await updateModule(programId, moduleId, { evaluationEnabled: enabled });
    if (success) {
      setModules((prev) => prev.map(m => m.id === moduleId ? { ...m, evaluationEnabled: enabled } : m));
    }
  };

  const handleUpdateModuleFields = async (moduleId: string, fields: Partial<TrainingModule>) => {
    if (isReadOnly) return;
    const success = await updateModule(programId, moduleId, fields);
    if (success) {
      setModules((prev) => prev.map(m => m.id === moduleId ? { ...m, ...fields } : m));
    }
  };

  const handleRemoveModule = async (moduleId: string) => {
    if (isReadOnly) return;
    const success = await removeModule(programId, moduleId);
    if (success) {
      setModules((prev) => prev.filter(m => m.id !== moduleId));
      if (expandedModuleId === moduleId) setExpandedModuleId(null);
      showToast('success', language === 'es' ? 'Módulo eliminado' : 'Module removed');
    } else {
      showToast('error', language === 'es' ? 'Error al eliminar módulo' : 'Error removing module');
    }
  };

  // Save draft details
  const handleSave = async () => {
    if (isReadOnly || !title.trim()) return;
    setSaving(true);
    try {
      const success = await updateProgram(programId, {
        title,
        description,
        welcomeMessage,
        aiPersonality,
        passingScore,
      });

      if (success) {
        showToast('success', language === 'es' ? 'Programa guardado exitosamente' : 'Program saved successfully');
        loadProgramDetails();
      } else {
        throw new Error('Sincronización fallida');
      }
    } catch (err: any) {
      showToast('error', err.message || (language === 'es' ? 'Error al guardar' : 'Error saving'));
    } finally {
      setSaving(false);
    }
  };

  // Publish Program
  const handlePublish = async () => {
    if (modules.length === 0) {
      showToast('error', language === 'es' ? 'No puedes publicar un programa sin módulos' : 'Cannot publish program without modules');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/training/programs/${programId}/publish`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to publish program');
      }

      showToast('success', language === 'es' ? 'Programa publicado exitosamente' : 'Program published successfully');
      loadProgramDetails();
    } catch (err: any) {
      showToast('error', err.message || 'Error');
    } finally {
      setPublishing(false);
    }
  };

  // Create new draft version
  const handleCreateNewVersion = async () => {
    setVersioning(true);
    try {
      const res = await fetch(`/api/training/programs/${programId}/versions`, {
        method: 'POST',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create new draft version');
      }

      const body = await res.json();
      showToast('success', language === 'es' ? 'Nueva versión borrador creada' : 'New draft version created');
      router.push(`/admin/training/configure/${body.programId}`);
    } catch (err: any) {
      showToast('error', err.message || 'Error');
    } finally {
      setVersioning(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-border/30 rounded-xl animate-pulse" />
          <div className="h-7 w-56 bg-border/30 rounded-lg animate-pulse" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
            <div className="h-5 w-40 bg-border/30 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-10 bg-border/30 rounded-xl animate-pulse" />
              <div className="h-10 bg-border/30 rounded-xl animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 p-6 space-y-6 max-w-4xl">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success' ? 'bg-success text-white font-medium' : 'bg-red-500 text-white font-medium'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/training"
            className="p-2 rounded-xl hover:bg-background border border-border/50 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">
                {language === 'es' ? 'Configurar Programa' : 'Configure Program'}
              </h1>
              {role && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary-light text-primary font-medium">
                  <Briefcase className="h-3 w-3" />
                  {role.title}
                </span>
              )}
              <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded font-bold uppercase ${
                program?.status === 'published' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              }`}>
                {program?.status} (v{program?.version})
              </span>
            </div>
            <p className="text-sm text-muted">
              {language === 'es'
                ? 'Define el contenido, documentos y módulos de entrenamiento para el puesto.'
                : 'Define the content, documents, and training modules for the role.'}
            </p>
          </div>
        </div>

        {/* Acciones de Publicación y Versionado */}
        <div className="flex items-center gap-3">
          {program?.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishing || modules.length === 0}
              className="inline-flex items-center gap-2 bg-success hover:bg-success-hover text-white font-semibold py-2 px-4 rounded-xl text-sm transition-all shadow-sm"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {language === 'es' ? 'Publicar Programa' : 'Publish Program'}
            </button>
          )}

          {program?.status === 'published' && (
            <button
              onClick={handleCreateNewVersion}
              disabled={versioning}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl text-sm transition-all shadow-sm"
            >
              {versioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {language === 'es' ? 'Crear Nueva Versión Borrador' : 'Create New Draft Version'}
            </button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="p-4 rounded-xl bg-warning/15 border border-warning/30 flex items-center gap-3 text-warning">
          <FileWarning className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">
            {language === 'es'
              ? 'Este programa se encuentra PUBLICADO y es de SOLO LECTURA. Crea una nueva versión borrador para poder editarlo.'
              : 'This program is PUBLISHED and is READ-ONLY. Create a new draft version to make edits.'}
          </p>
        </div>
      )}

      {/* Program Info Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {language === 'es' ? 'Información del Programa' : 'Program Information'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {language === 'es' ? 'Título del Programa' : 'Program Title'}
            </label>
            <input
              type="text"
              value={title}
              disabled={isReadOnly}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'es' ? 'Ej: Onboarding Ingeniería' : 'E.g.: Engineering Onboarding'}
              className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {language === 'es' ? 'Personalidad de la IA' : 'AI Personality'}
            </label>
            <select
              value={aiPersonality}
              disabled={isReadOnly}
              onChange={(e) => setAiPersonality(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm disabled:opacity-60"
            >
              <option value="friendly_mentor">{language === 'es' ? 'Mentor Amigable' : 'Friendly Mentor'}</option>
              <option value="strict_teacher">{language === 'es' ? 'Profesor Estricto' : 'Strict Teacher'}</option>
              <option value="casual_colleague">{language === 'es' ? 'Colega Casual' : 'Casual Colleague'}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {language === 'es' ? 'Descripción' : 'Description'}
          </label>
          <textarea
            value={description}
            disabled={isReadOnly}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={language === 'es' ? 'Describe brevemente el programa...' : 'Briefly describe the program...'}
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none text-sm disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {language === 'es' ? 'Mensaje de Bienvenida (AI)' : 'Welcome Message (AI)'}
            </label>
            <textarea
              value={welcomeMessage}
              disabled={isReadOnly}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder={language === 'es' ? 'Lo que dice la IA al iniciar el entrenamiento...' : 'What the AI says when starting training...'}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none text-sm disabled:opacity-60"
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                {language === 'es' ? `Calificación mínima para aprobar: ${passingScore}%` : `Passing score threshold: ${passingScore}%`}
              </label>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={passingScore}
                disabled={isReadOnly}
                onChange={(e) => setPassingScore(Number(e.target.value))}
                className="w-full accent-primary bg-border/50 h-2 rounded-lg cursor-pointer disabled:opacity-55"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Documents Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {language === 'es' ? 'Base de Conocimiento' : 'Knowledge Base'}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {language === 'es'
              ? 'Sube documentos para que la IA los use como referencia de capacitación.'
              : 'Upload documents for the AI to reference during training.'}
          </p>
        </div>

        {/* Drag & Drop Zone (Solo si es editable) */}
        {!isReadOnly && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-1 bg-background border border-border/50 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setDocScope('role')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  docScope === 'role'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                {language === 'es' ? 'Por Vacante / Rol' : 'Specific to Role'}
              </button>
              <button
                type="button"
                onClick={() => setDocScope('organization')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  docScope === 'organization'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                {language === 'es' ? 'Institucional / Reutilizable' : 'Institutional / Reusable'}
              </button>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 hover:border-primary/50 hover:bg-background'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className={`h-8 w-8 mb-3 ${isDragging ? 'text-primary' : 'text-muted'}`} />
              <p className="text-sm font-medium text-foreground">
                {language === 'es' ? 'Arrastra archivos aquí o haz clic para seleccionar' : 'Drag files here or click to select'}
              </p>
              <p className="text-xs text-muted mt-1">PDF, DOCX, TXT, MD (Max 15MB)</p>
            </div>
          </div>
        )}

        {/* Pending upload files */}
        {uploadFiles.length > 0 && !isReadOnly && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              {language === 'es' ? 'Archivos pendientes de subir' : 'Pending files to upload'}
            </p>
            {uploadFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50">
                <div className="flex items-center gap-3">
                  <File className="h-4 w-4 text-muted animate-pulse" />
                  <span className="text-sm text-foreground">{file.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getFileTypeBadgeColor(file.type)}`}>
                    {getFileTypeLabel(file.type)}
                  </span>
                </div>
                <button
                  onClick={() => removeUploadFile(idx)}
                  className="p-1 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              onClick={handleParseDocuments}
              disabled={parsingDocs}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 rounded-xl text-sm transition-all disabled:opacity-50"
            >
              {parsingDocs ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {language === 'es' ? 'Subiendo y Analizando...' : 'Uploading & Analyzing...'}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {language === 'es' ? 'Cargar Documentos seleccionados' : 'Upload selected Documents'}
                </>
              )}
            </button>
          </div>
        )}

        {/* Associated Documents */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            {language === 'es' ? 'Documentos del Programa' : 'Associated Documents'}
          </p>
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-muted">
                        <span className="inline-flex items-center gap-0.5 font-medium">
                          {doc.scope === 'organization' ? <Globe className="h-2.5 w-2.5" /> : <Briefcase className="h-2.5 w-2.5" />}
                          {doc.scope === 'organization' ? (language === 'es' ? 'Institucional' : 'Institutional') : (language === 'es' ? 'Por Vacante' : 'Specific')}
                        </span>
                        {doc.status !== 'ready' && (
                          <span className="text-warning font-bold bg-warning/15 px-1.5 py-0.2 rounded">
                            {doc.status.toUpperCase()}
                          </span>
                        )}
                        {doc.aiSummary && <span className="truncate max-w-[300px]">{doc.aiSummary}</span>}
                      </div>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <button
                      onClick={() => handleRemoveDocument(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors ml-2"
                      title={language === 'es' ? 'Quitar documento' : 'Detach document'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted py-2 italic">
              {language === 'es' ? 'No hay documentos asociados.' : 'No documents associated yet.'}
            </p>
          )}
        </div>

        {/* Biblioteca de Documentos Reutilizables (Solo si es editable) */}
        {!isReadOnly && availableDocuments.length > 0 && (
          <div className="pt-3 border-t border-border/40 space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              {language === 'es' ? 'Biblioteca Institucional / Disponible' : 'Institutional Library / Available'}
            </p>
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {availableDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/40 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted flex-shrink-0" />
                    <span className="font-medium text-foreground truncate">{doc.fileName}</span>
                    <span className="text-[9px] text-muted bg-border/40 px-1 py-0.2 rounded font-medium">
                      {doc.scope === 'organization' ? (language === 'es' ? 'Institucional' : 'Institutional') : (language === 'es' ? 'Vacante' : 'Specific')}
                    </span>
                  </div>
                  <button
                    onClick={() => handleAttachDocument(doc.id)}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-hover font-semibold px-2 py-1 rounded bg-primary-light transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {language === 'es' ? 'Asociar' : 'Attach'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modules Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {language === 'es' ? 'Módulos de Capacitación' : 'Training Modules'}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {language === 'es'
                ? 'Genera la estructura del curso automáticamente con IA basándote en la Base de Conocimiento.'
                : 'Automatically generate training course content using AI from your Knowledge Base.'}
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleGenerateModules}
                disabled={generatingModules || readyDocumentsCount === 0}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingModules ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {language === 'es' ? 'Generando...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {language === 'es' ? 'Generar Módulos con AI' : 'Generate Modules with AI'}
                  </>
                )}
              </button>
              {readyDocumentsCount === 0 && documents.length > 0 && (
                <p className="text-[11px] text-warning">
                  {language === 'es'
                    ? 'Los documentos asociados aún se están procesando. Espera a que estén listos.'
                    : 'Associated documents are still processing. Wait until they are ready.'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modules List */}
        {modules.length > 0 ? (
          <div className="space-y-3">
            {modules
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((mod) => (
                <div key={mod.id} className="rounded-xl border border-border/50 bg-background overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{mod.title}</p>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary text-[10px] font-medium flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {mod.durationEstimate} min
                        </span>
                        {mod.evaluationEnabled && (
                          <span className="bg-success-light text-success font-semibold px-2 py-0.5 rounded-full text-[9px]">
                            {language === 'es' ? 'Con Evaluación' : 'Has Evaluation'}
                          </span>
                        )}
                      </div>
                      {mod.description && (
                        <p className="text-xs text-muted mt-0.5 truncate">{mod.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Evaluation Toggle */}
                      {!isReadOnly && (
                        <button
                          onClick={() => handleToggleEvaluation(mod.id, !mod.evaluationEnabled)}
                          className="p-1.5 rounded-lg hover:bg-background transition-colors"
                          title={language === 'es' ? 'Evaluación' : 'Evaluation'}
                        >
                          {mod.evaluationEnabled ? (
                            <ToggleRight className="h-5 w-5 text-primary" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted" />
                          )}
                        </button>
                      )}
                      {/* Expand/Collapse */}
                      <button
                        onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                        className="p-1.5 rounded-lg hover:bg-background transition-colors"
                      >
                        {expandedModuleId === mod.id ? (
                          <ChevronUp className="h-4 w-4 text-muted" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted" />
                        )}
                      </button>
                      {/* Delete */}
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRemoveModule(mod.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Section Editor */}
                  {expandedModuleId === mod.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Título' : 'Title'}
                        </label>
                        <input
                          type="text"
                          value={mod.title}
                          disabled={isReadOnly}
                          onChange={(e) => handleUpdateModuleFields(mod.id, { title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Descripción' : 'Description'}
                        </label>
                        <textarea
                          value={mod.description || ''}
                          disabled={isReadOnly}
                          onChange={(e) => handleUpdateModuleFields(mod.id, { description: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Duración estimada (min)' : 'Estimated duration (min)'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={mod.durationEstimate}
                          disabled={isReadOnly}
                          onChange={(e) => handleUpdateModuleFields(mod.id, { durationEstimate: Math.max(1, Number(e.target.value)) })}
                          className="w-32 px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </div>
                      {/* Sections preview */}
                      {mod.content?.sections && mod.content.sections.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">
                            {language === 'es' ? 'Secciones' : 'Sections'} ({mod.content.sections.length})
                          </label>
                          <div className="space-y-1">
                            {mod.content.sections.map((section: any, idx: number) => (
                              <div key={idx} className="text-xs text-muted bg-card p-2 rounded-lg border border-border/50">
                                <span className="font-medium text-foreground">{idx + 1}.</span> {section.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border/50 rounded-xl bg-background/50">
            <FileText className="h-8 w-8 text-muted mb-2 animate-pulse" />
            <p className="text-sm text-muted text-center">
              {language === 'es'
                ? 'No hay módulos creados. Genera módulos con IA o agrega uno manual.'
                : 'No modules created. Generate course using AI or add one manually.'}
            </p>
          </div>
        )}

        {/* Add Manual Module */}
        {!isReadOnly && (
          <button
            onClick={handleAddManualModule}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover transition-colors py-2"
          >
            <Plus className="h-4 w-4" />
            {language === 'es' ? 'Agregar Módulo Manual' : 'Add Manual Module'}
          </button>
        )}
      </div>

      {/* Save Button (Solo si es borrador) */}
      {!isReadOnly && (
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === 'es' ? 'Guardando...' : 'Saving...'}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {language === 'es' ? 'Guardar Cambios' : 'Save Changes'}
            </>
          )}
        </button>
      )}
    </div>
  );
}
