'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileText,
  File,
  Trash2,
  GripVertical,
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
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';
import type { TrainingModule, TrainingDocument } from '@/types';

export default function ConfigureTrainingPage() {
  const { language } = useAppStore();
  const {
    programs,
    documents,
    modules,
    loading,
    fetchTrainingData,
    createProgram,
    updateProgram,
    addDocument,
    removeDocument,
    reorderDocuments,
    setModules,
    addModule,
    updateModule,
    removeModule,
    reorderModules,
  } = useTrainingAdminStore();

  // Program state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [aiPersonality, setAiPersonality] = useState('friendly_mentor');

  // Document state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [parsingDocs, setParsingDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Module state
  const [generatingModules, setGeneratingModules] = useState(false);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  // Initialize form with existing program data
  useEffect(() => {
    if (programs.length > 0) {
      const program = programs[0];
      setTitle(program.title || '');
      setDescription(program.description || '');
      setWelcomeMessage(program.welcomeMessage || '');
      setAiPersonality(program.aiPersonality || 'friendly_mentor');
    }
  }, [programs]);

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

  // File upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || f.type === 'text/plain'
    );
    setUploadFiles((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (type === 'text/plain') return 'TXT';
    return 'FILE';
  };

  const getFileTypeBadgeColor = (type: string) => {
    if (type === 'application/pdf') return 'bg-red-100 text-red-700';
    if (type.includes('wordprocessingml')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  // Parse documents
  const handleParseDocuments = async () => {
    if (uploadFiles.length === 0 && documents.length === 0) return;
    setParsingDocs(true);
    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch('/api/training/parse-documents', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to parse documents');

      const data = await res.json();
      if (data.documents && Array.isArray(data.documents)) {
        data.documents.forEach((doc: TrainingDocument) => {
          addDocument(doc);
        });
      }
      setUploadFiles([]);
      showToast('success', language === 'es' ? 'Documentos analizados exitosamente' : 'Documents analyzed successfully');
    } catch (err) {
      showToast('error', language === 'es' ? 'Error al analizar documentos' : 'Error analyzing documents');
    } finally {
      setParsingDocs(false);
    }
  };

  // Generate modules with AI
  const handleGenerateModules = async () => {
    setGeneratingModules(true);
    try {
      const res = await fetch('/api/training/generate-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: documents.map((d) => ({
            id: d.id,
            fileName: d.fileName,
            extractedText: d.extractedText,
            aiSummary: d.aiSummary,
            aiTopics: d.aiTopics,
          })),
          programTitle: title,
          programDescription: description,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate modules');

      const data = await res.json();
      if (data.modules && Array.isArray(data.modules)) {
        setModules(data.modules);
      }
      showToast('success', language === 'es' ? 'Modulos generados con AI' : 'Modules generated with AI');
    } catch (err) {
      showToast('error', language === 'es' ? 'Error al generar modulos' : 'Error generating modules');
    } finally {
      setGeneratingModules(false);
    }
  };

  // Add manual module
  const handleAddManualModule = () => {
    const newModule: TrainingModule = {
      id: crypto.randomUUID(),
      programId: programs[0]?.id || '',
      title: language === 'es' ? 'Nuevo Modulo' : 'New Module',
      description: '',
      content: { sections: [] },
      sortOrder: modules.length,
      durationEstimate: 15,
      evaluationEnabled: false,
      evaluationQuestions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addModule(newModule);
  };

  // Toggle evaluation
  const handleToggleEvaluation = (moduleId: string, enabled: boolean) => {
    updateModule(moduleId, { evaluationEnabled: enabled });
  };

  // Save program
  const handleSave = async () => {
    setSaving(true);
    try {
      if (programs.length > 0) {
        await updateProgram(programs[0].id, {
          title,
          description,
          welcomeMessage,
          aiPersonality,
        });
      } else {
        await createProgram({
          orgId: '',
          title,
          description,
          isDefault: true,
          welcomeMessage,
          aiPersonality,
        });
      }
      showToast('success', language === 'es' ? 'Programa guardado exitosamente' : 'Program saved successfully');
    } catch (err) {
      showToast('error', language === 'es' ? 'Error al guardar' : 'Error saving');
    } finally {
      setSaving(false);
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
          toast.type === 'success' ? 'bg-success text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/training"
          className="p-2 rounded-xl hover:bg-background border border-border/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            {language === 'es' ? 'Configurar Programa' : 'Configure Program'}
          </h1>
          <p className="text-sm text-muted">
            {language === 'es'
              ? 'Define el contenido, documentos y modulos de entrenamiento'
              : 'Define the content, documents, and training modules'}
          </p>
        </div>
      </div>

      {/* Program Info Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {language === 'es' ? 'Informacion del Programa' : 'Program Information'}
        </h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {language === 'es' ? 'Titulo del Programa' : 'Program Title'}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={language === 'es' ? 'Ej: Onboarding Ingenieria' : 'E.g.: Engineering Onboarding'}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {language === 'es' ? 'Descripcion' : 'Description'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={language === 'es' ? 'Describe brevemente el programa...' : 'Briefly describe the program...'}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {language === 'es' ? 'Mensaje de Bienvenida (AI)' : 'Welcome Message (AI)'}
          </label>
          <textarea
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder={language === 'es' ? 'Lo que dice la IA al iniciar el entrenamiento...' : 'What the AI says when starting training...'}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {language === 'es' ? 'Personalidad de la IA' : 'AI Personality'}
          </label>
          <select
            value={aiPersonality}
            onChange={(e) => setAiPersonality(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          >
            <option value="friendly_mentor">
              {language === 'es' ? 'Mentor Amigable' : 'Friendly Mentor'}
            </option>
            <option value="strict_teacher">
              {language === 'es' ? 'Profesor Estricto' : 'Strict Teacher'}
            </option>
            <option value="casual_colleague">
              {language === 'es' ? 'Colega Casual' : 'Casual Colleague'}
            </option>
          </select>
        </div>
      </div>

      {/* Documents Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          {language === 'es' ? 'Base de Conocimiento' : 'Knowledge Base'}
        </h2>
        <p className="text-sm text-muted -mt-2">
          {language === 'es'
            ? 'Sube documentos para que la IA genere modulos de entrenamiento'
            : 'Upload documents so the AI can generate training modules'}
        </p>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border/50 hover:border-primary/50 hover:bg-background'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className={`h-8 w-8 mb-3 ${isDragging ? 'text-primary' : 'text-muted'}`} />
          <p className="text-sm font-medium text-foreground">
            {language === 'es' ? 'Arrastra archivos aqui o haz clic para seleccionar' : 'Drag files here or click to select'}
          </p>
          <p className="text-xs text-muted mt-1">PDF, DOCX, TXT</p>
        </div>

        {/* Pending upload files */}
        {uploadFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              {language === 'es' ? 'Archivos pendientes' : 'Pending files'}
            </p>
            {uploadFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50">
                <div className="flex items-center gap-3">
                  <File className="h-4 w-4 text-muted" />
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
          </div>
        )}

        {/* Existing documents */}
        {documents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              {language === 'es' ? 'Documentos analizados' : 'Analyzed documents'}
            </p>
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <GripVertical className="h-4 w-4 text-muted/50 cursor-grab flex-shrink-0" />
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                    {doc.aiSummary && (
                      <p className="text-xs text-muted truncate mt-0.5">{doc.aiSummary}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getFileTypeBadgeColor(doc.fileType)}`}>
                    {getFileTypeLabel(doc.fileType)}
                  </span>
                </div>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="p-1 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Analyze button */}
        <button
          onClick={handleParseDocuments}
          disabled={parsingDocs || (uploadFiles.length === 0 && documents.length === 0)}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {parsingDocs ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === 'es' ? 'Analizando...' : 'Analyzing...'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {language === 'es' ? 'Analizar Documentos' : 'Analyze Documents'}
            </>
          )}
        </button>
      </div>

      {/* Modules Section */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {language === 'es' ? 'Modulos de Capacitacion' : 'Training Modules'}
            </h2>
            <p className="text-sm text-muted mt-0.5">
              {language === 'es'
                ? 'Genera modulos automaticamente o crealos manualmente'
                : 'Generate modules automatically or create them manually'}
            </p>
          </div>
          <button
            onClick={handleGenerateModules}
            disabled={generatingModules || documents.length === 0}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingModules ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {language === 'es' ? 'Generando...' : 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {language === 'es' ? 'Generar Modulos con AI' : 'Generate Modules with AI'}
              </>
            )}
          </button>
        </div>

        {/* Modules List */}
        {modules.length > 0 ? (
          <div className="space-y-3">
            {modules
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((mod) => (
                <div key={mod.id} className="rounded-xl border border-border/50 bg-background overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <GripVertical className="h-4 w-4 text-muted/50 cursor-grab flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{mod.title}</p>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-light text-primary text-[10px] font-medium flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {mod.durationEstimate} min
                        </span>
                      </div>
                      {mod.description && (
                        <p className="text-xs text-muted mt-0.5 truncate">{mod.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Evaluation Toggle */}
                      <button
                        onClick={() => handleToggleEvaluation(mod.id, !mod.evaluationEnabled)}
                        className="p-1.5 rounded-lg hover:bg-background transition-colors"
                        title={language === 'es' ? 'Evaluacion' : 'Evaluation'}
                      >
                        {mod.evaluationEnabled ? (
                          <ToggleRight className="h-5 w-5 text-primary" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted" />
                        )}
                      </button>
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
                      <button
                        onClick={() => removeModule(mod.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Section Editor */}
                  {expandedModuleId === mod.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Titulo' : 'Title'}
                        </label>
                        <input
                          type="text"
                          value={mod.title}
                          onChange={(e) => updateModule(mod.id, { title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Descripcion' : 'Description'}
                        </label>
                        <textarea
                          value={mod.description || ''}
                          onChange={(e) => updateModule(mod.id, { description: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">
                          {language === 'es' ? 'Duracion estimada (min)' : 'Estimated duration (min)'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={mod.durationEstimate}
                          onChange={(e) => updateModule(mod.id, { durationEstimate: Number(e.target.value) })}
                          className="w-32 px-3 py-2 rounded-lg border border-border/50 bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      {/* Sections preview */}
                      {mod.content.sections.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">
                            {language === 'es' ? 'Secciones' : 'Sections'} ({mod.content.sections.length})
                          </label>
                          <div className="space-y-1">
                            {mod.content.sections.map((section, idx) => (
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
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border/50 rounded-xl">
            <FileText className="h-8 w-8 text-muted mb-2" />
            <p className="text-sm text-muted text-center">
              {language === 'es'
                ? 'No hay modulos aun. Genera modulos con AI o agrega uno manualmente.'
                : 'No modules yet. Generate modules with AI or add one manually.'}
            </p>
          </div>
        )}

        {/* Add Manual Module */}
        <button
          onClick={handleAddManualModule}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover transition-colors py-2"
        >
          <Plus className="h-4 w-4" />
          {language === 'es' ? 'Agregar Modulo Manual' : 'Add Manual Module'}
        </button>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || !title.trim()}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {language === 'es' ? 'Guardando...' : 'Saving...'}
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            {language === 'es' ? 'Guardar Programa' : 'Save Program'}
          </>
        )}
      </button>
    </div>
  );
}
