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
  FileWarning,
  Info,
  X
} from 'lucide-react';
import { useAppStore, type Language } from '@/store/appStore';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';
import { createClient } from '@/utils/supabase/client';
import type { TrainingModule, TrainingDocument, TrainingProgram, TrainingProgramStatus } from '@/types';
import {
  DEFAULT_TRAINING_CONTENT_LANGUAGE,
  resolveTrainingContentLanguage,
  type TrainingContentLanguage,
} from '@/lib/training/content-language';
// De `client-ocr` aquí solo entran tipos y un número. Lo que pesa de ese módulo
// no es su código (unos pocos KB) sino `pdfjs-dist` y `tesseract.js`, megabytes
// entre JavaScript, WASM y datos de idioma, y esos dos viven detrás de un
// `import()` dinámico *dentro* de sus funciones: quedan en chunks aparte y solo
// se descargan cuando un lote trae un PDF. La función de OCR se importa también
// de forma dinámica, más abajo, para no cablear el módulo en el arranque de la
// pantalla.
import type {
  ClientOcrPhase,
  ClientPdfTextResult,
} from '@/lib/training/client-ocr';
import { DEFAULT_OCR_PAGE_LIMIT } from '@/lib/training/client-ocr';
// Anillo de foco compartido del rediseño. Es una cadena de clases, no un
// componente: no arrastra nada al bundle y evita que este botón nuevo sea el
// único de la aplicación sin foco visible.
import { focusRing } from '@/components/training/ui';

/**
 * Bucket privado de documentos de capacitación.
 *
 * Se repite aquí como literal porque `src/lib/training/documents.ts` es
 * `server-only` y este archivo es un componente de cliente. El nombre tiene que
 * coincidir con el del servidor, pero la subida usa una URL firmada emitida por
 * `upload-url`, así que un desajuste se manifestaría de inmediato como error de
 * subida y no como un fallo silencioso.
 */
const TRAINING_DOCUMENTS_BUCKET = 'training-documents';

/** Solo informativo: el límite real lo aplica el servidor sobre los bytes. */
const MAX_TRAINING_FILE_SIZE_MB = 15;

/**
 * Tope de archivos por lote en la interfaz.
 *
 * El camino heredado (`POST /api/training/documents`) limitaba a 5 archivos
 * porque todos viajaban en el mismo `multipart/form-data`. Con el transporte
 * nuevo cada archivo tiene su propia petición, así que ese límite dejó de
 * aplicar. Se conserva un tope, más alto, por dos razones de interfaz: el lote
 * es secuencial, y 10 archivos ya suponen una espera larga con la pestaña
 * abierta; y el panel de progreso deja de ser legible si crece sin medida.
 */
const MAX_UPLOAD_BATCH = 10;

/**
 * Estado de un archivo dentro del flujo de subida.
 *
 * `ocr` es un paso intermedio que solo aparece con PDF escaneados: entre la
 * subida al bucket y el procesamiento en el servidor, el navegador reconoce el
 * texto del PDF (ver `@/lib/training/client-ocr`). Es el paso más largo con
 * diferencia —minutos, no segundos—, así que tiene su propio estado, su propio
 * detalle de progreso y su propio botón de cancelar.
 */
type UploadStepStatus =
  | 'pending'
  | 'uploading'
  | 'ocr'
  | 'processing'
  | 'done'
  | 'failed';

/**
 * Detalle del OCR de navegador de un archivo.
 *
 * Es una unión discriminada y no un objeto con banderas porque los cuatro
 * desenlaces del OCR no comparten datos: mientras corre importan la fase y la
 * página; cuando acaba bien importan las páginas reconocidas y si el resultado
 * quedó incompleto; y cuando se cancela o falla no queda ninguna cifra que
 * valga la pena mostrar, solo la consecuencia (el documento se queda pendiente
 * de OCR). Con banderas sueltas habría estados imposibles representables, como
 * «cancelado en la página 7 de 0».
 */
type UploadOcrState =
  | {
      stage: 'running';
      phase: ClientOcrPhase;
      /** Página en curso, 1-based. `0` cuando la fase no es de página. */
      page: number;
      totalPages: number;
      /** Avance dentro de la página, 0..1. */
      pageProgress: number;
    }
  | {
      stage: 'done';
      pagesProcessed: number;
      totalPages: number;
      /** El texto no cubre el documento entero (tope de páginas o de caracteres). */
      partial: boolean;
    }
  /** El administrador lo canceló: el documento se procesa sin texto de OCR. */
  | { stage: 'cancelled' }
  /**
   * El OCR no dio texto utilizable. `empty` es un escaneo ilegible o en blanco;
   * `error` es cualquier otro fallo (PDF cifrado, motor que no carga, memoria).
   * En los dos casos el documento se procesa igual y queda en `needs_ocr`.
   */
  | { stage: 'failed'; cause: 'empty' | 'error' };

interface UploadItemState {
  key: string;
  fileName: string;
  status: UploadStepStatus;
  /** Motivo del fallo, ya traducido y listo para mostrar. */
  reason?: string;
  /** Detalle del OCR; ausente si el archivo no lo necesitó (no era PDF o traía texto). */
  ocr?: UploadOcrState;
}

/**
 * Tope de páginas del OCR de navegador para esta pantalla.
 *
 * El módulo de OCR ya trae un defecto; se fija aquí de forma explícita para que
 * el texto que ve el administrador («hasta N páginas») y el comportamiento real
 * no puedan divergir.
 */
const OCR_PAGE_LIMIT = DEFAULT_OCR_PAGE_LIMIT;

/**
 * Redondea el avance de página a pasos del 5 %.
 *
 * El motor de OCR informa del progreso decenas de veces por página. Sin
 * redondeo, cada aviso sería un `setState` y un renderizado de la pantalla
 * completa mientras el hilo ya está saturado reconociendo texto. A pasos del
 * 5 % el estado solo cambia veinte veces por página, que es más de lo que una
 * barra de progreso necesita para no parecer congelada.
 */
const quantizePageProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;

  return Math.min(1, Math.max(0, Math.round(value * 20) / 20));
};

/** Igualdad del detalle del OCR: un aviso que no cambia nada no debe renderizar. */
const shallowEqualOcr = (a: UploadOcrState, b: UploadOcrState) => {
  if (a.stage !== b.stage) return false;

  if (a.stage === 'running' && b.stage === 'running') {
    return (
      a.phase === b.phase &&
      a.page === b.page &&
      a.totalPages === b.totalPages &&
      a.pageProgress === b.pageProgress
    );
  }

  if (a.stage === 'done' && b.stage === 'done') {
    return (
      a.pagesProcessed === b.pagesProcessed &&
      a.totalPages === b.totalPages &&
      a.partial === b.partial
    );
  }

  if (a.stage === 'failed' && b.stage === 'failed') {
    return a.cause === b.cause;
  }

  // `cancelled` no lleva datos: mismo estado, misma vista.
  return true;
};

/** Porcentaje del avance del documento, para la barra de progreso. */
const ocrPercent = (ocr: UploadOcrState) => {
  if (ocr.stage !== 'running' || ocr.totalPages <= 0) return 0;

  const completedPages = Math.max(0, ocr.page - 1);
  const withinPage = ocr.phase === 'recognizing' ? ocr.pageProgress : 0;
  const ratio = (completedPages + withinPage) / ocr.totalPages;

  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
};

/**
 * Texto del OCR para el administrador.
 *
 * Cada fase dice lo que está pasando **y** cuánto queda, porque el OCR tarda
 * minutos y un rótulo genérico («procesando») no distingue «va por la página 3
 * de 40» de «se colgó». `loading-engine` es el caso crítico: la primera vez
 * descarga el motor WASM y los datos del idioma, tarda y no tiene páginas que
 * contar, así que si no se dice explícitamente parece congelado.
 */
const describeOcrState = (ocr: UploadOcrState, language: Language): string => {
  const es = language === 'es';

  if (ocr.stage === 'running') {
    if (ocr.phase === 'text-layer') {
      return es
        ? `Comprobando si el PDF ya trae texto (página ${ocr.page} de ${ocr.totalPages})`
        : `Checking whether the PDF already has text (page ${ocr.page} of ${ocr.totalPages})`;
    }

    if (ocr.phase === 'loading-engine') {
      return es
        ? 'Descargando el motor de OCR y los datos del idioma. La primera vez tarda varios minutos: no está detenido.'
        : 'Downloading the OCR engine and the language data. The first time takes several minutes: it is not stuck.';
    }

    if (ocr.phase === 'rendering') {
      return es
        ? `Preparando la página ${ocr.page} de ${ocr.totalPages} para el OCR`
        : `Preparing page ${ocr.page} of ${ocr.totalPages} for OCR`;
    }

    return es
      ? `Reconociendo texto: página ${ocr.page} de ${ocr.totalPages}`
      : `Recognizing text: page ${ocr.page} of ${ocr.totalPages}`;
  }

  if (ocr.stage === 'done') {
    if (ocr.partial) {
      return es
        ? `OCR parcial: se procesaron ${ocr.pagesProcessed} de ${ocr.totalPages} páginas. El resto del documento no llegó al servidor.`
        : `Partial OCR: ${ocr.pagesProcessed} of ${ocr.totalPages} pages were processed. The rest of the document never reached the server.`;
    }

    return es
      ? `Texto reconocido con OCR (${ocr.pagesProcessed} de ${ocr.totalPages} páginas).`
      : `Text recognized with OCR (${ocr.pagesProcessed} of ${ocr.totalPages} pages).`;
  }

  if (ocr.stage === 'cancelled') {
    return es
      ? 'OCR cancelado. El documento se guarda igual y queda pendiente de OCR.'
      : 'OCR cancelled. The document is still saved and stays pending OCR.';
  }

  if (ocr.cause === 'empty') {
    return es
      ? 'El escaneo no produjo texto legible. El documento se guarda igual y queda pendiente de OCR.'
      : 'The scan produced no readable text. The document is still saved and stays pending OCR.';
  }

  return es
    ? 'No se pudo ejecutar el OCR en este navegador. El documento se guarda igual y queda pendiente de OCR.'
    : 'OCR could not run in this browser. The document is still saved and stays pending OCR.';
};

/** El desenlace del OCR merece color de aviso; el avance normal, no. */
const isOcrStateNoteworthy = (ocr: UploadOcrState) =>
  ocr.stage === 'cancelled' ||
  ocr.stage === 'failed' ||
  (ocr.stage === 'done' && ocr.partial);

/**
 * Frase única del paso en curso, para la región en vivo del panel.
 *
 * Un lector de pantalla no puede seguir una barra de progreso ni varias filas
 * cambiando a la vez: necesita una frase que diga qué archivo y en qué paso va.
 * El lote es secuencial, así que hay como mucho un archivo en vuelo y una frase
 * que describirlo.
 */
const describeUploadStep = (
  item: UploadItemState | undefined,
  language: Language
): string => {
  if (!item) return '';

  const es = language === 'es';

  if (item.status === 'ocr' && item.ocr) {
    return `${item.fileName}: ${describeOcrState(item.ocr, language)}`;
  }

  if (item.status === 'uploading') {
    return `${item.fileName}: ${es ? 'subiendo el archivo' : 'uploading the file'}`;
  }

  if (item.status === 'processing') {
    return `${item.fileName}: ${es ? 'procesando en el servidor' : 'processing on the server'}`;
  }

  return '';
};

/**
 * Identidad estable de un archivo seleccionado.
 *
 * `File` no tiene identificador, y el índice del array no sirve porque la lista
 * cambia cuando se retiran los archivos procesados. Nombre, tamaño y fecha de
 * modificación son suficientes para emparejar la fila del panel con el archivo
 * mientras dura el lote.
 */
const buildFileKey = (file: File) => `${file.name}::${file.size}::${file.lastModified}`;

/**
 * Texto para el administrador según el `code` que devuelve
 * `POST /api/training/generate-modules`.
 *
 * La ruta responde siempre con `{ error, code }`: el `error` es un texto en
 * inglés estable para cualquier consumidor de la API, y el `code` es lo que
 * permite elegir aquí un mensaje bilingüe y accionable. El catálogo del servidor
 * (`src/lib/training/module-generation.ts`) es `server-only`, así que no se
 * puede importar desde un componente de cliente; el `code` es justamente el
 * contrato que evita duplicar los textos por accidente. Un `code` desconocido
 * cae en el `error` de la respuesta.
 */
const GENERATE_MODULES_ERROR_MESSAGES: Record<string, { es: string; en: string }> = {
  AI_NOT_CONFIGURED: {
    es: 'El servicio de IA no está configurado en el servidor (falta OPENROUTER_API_KEY). Revisa el diagnóstico del centro de capacitación.',
    en: 'The AI service is not configured on the server (OPENROUTER_API_KEY is missing). Check the training center diagnostics.',
  },
  AI_UNAVAILABLE: {
    es: 'El servicio de IA rechazó la petición. Suele ser clave inválida, saldo agotado o límite de uso: el motivo exacto queda en el log del servidor. Vuelve a intentarlo en unos minutos.',
    en: 'The AI service rejected the request. Usually an invalid key, exhausted credit or a rate limit: the exact reason is in the server log. Try again in a few minutes.',
  },
  AI_TIMEOUT: {
    es: 'La generación tardó demasiado y se canceló. No se guardó nada. Vuelve a intentarlo, y si se repite reduce el número de documentos asociados.',
    en: 'Generation took too long and was cancelled. Nothing was saved. Try again, and if it keeps happening reduce the number of associated documents.',
  },
  AI_INVALID_JSON: {
    es: 'La IA devolvió una respuesta ilegible. No se guardó nada. Vuelve a intentarlo.',
    en: 'The AI returned an unreadable response. Nothing was saved. Try again.',
  },
  AI_INVALID_STRUCTURE: {
    es: 'La IA no logró devolver módulos con el formato correcto, ni tras un reintento. No se guardó nada. Vuelve a intentarlo; si se repite, revisa que los documentos tengan contenido claro y suficiente.',
    en: 'The AI could not return modules in the correct format, even after a retry. Nothing was saved. Try again; if it keeps happening, check that the documents have clear, sufficient content.',
  },
  AI_NO_VALID_SOURCE: {
    es: 'La IA generó un módulo sin ningún documento válido de este programa. No se guardó nada. Vuelve a intentarlo.',
    en: 'The AI generated a module with no valid document from this program. Nothing was saved. Try again.',
  },
};

/**
 * Aviso de material que no llegó al modelo.
 *
 * Lo añade `POST /api/training/generate-modules` a su respuesta de éxito solo
 * cuando hubo truncamiento o documentos fuera del tope. Es información, no
 * error: los módulos se generaron y se guardaron. Se muestra porque el
 * administrador es el único que puede decidir qué hacer al respecto (dividir el
 * programa, quitar documentos o subir el presupuesto de contexto), y porque
 * recortar en silencio es justo lo que hacía que la IA rellenara los huecos.
 *
 * La forma se declara aquí, y no se importa del servidor, por lo mismo que el
 * catálogo de errores: el módulo del servidor es `server-only`.
 */
interface GenerationContextNotice {
  budgetChars: number;
  documentLimit: number;
  documentsOmittedByLimit: number;
  omittedChars: number;
  truncatedDocuments: Array<{
    fileName: string;
    includedChars: number;
    omittedChars: number;
  }>;
}

/** Validación defensiva de la forma del aviso antes de renderizarlo. */
const parseContextNotice = (value: unknown): GenerationContextNotice | null => {
  if (typeof value !== 'object' || value === null) return null;

  const raw = value as Record<string, unknown>;
  const truncated = Array.isArray(raw.truncatedDocuments)
    ? raw.truncatedDocuments.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const doc = entry as Record<string, unknown>;
        if (typeof doc.fileName !== 'string') return [];
        return [
          {
            fileName: doc.fileName,
            includedChars: typeof doc.includedChars === 'number' ? doc.includedChars : 0,
            omittedChars: typeof doc.omittedChars === 'number' ? doc.omittedChars : 0,
          },
        ];
      })
    : [];

  const documentsOmittedByLimit =
    typeof raw.documentsOmittedByLimit === 'number' ? raw.documentsOmittedByLimit : 0;

  if (truncated.length === 0 && documentsOmittedByLimit === 0) return null;

  return {
    budgetChars: typeof raw.budgetChars === 'number' ? raw.budgetChars : 0,
    documentLimit: typeof raw.documentLimit === 'number' ? raw.documentLimit : 0,
    documentsOmittedByLimit,
    omittedChars: typeof raw.omittedChars === 'number' ? raw.omittedChars : 0,
    truncatedDocuments: truncated,
  };
};

/** Miles con separador local, para que las cifras del aviso se lean. */
const formatChars = (value: number, language: Language) =>
  value.toLocaleString(language === 'es' ? 'es-ES' : 'en-US');

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
  // Idioma del contenido del programa. No es la preferencia de idioma del
  // administrador (`language`): es el idioma en el que la IA genera los módulos y
  // en el que ve la capacitación el empleado.
  const [contentLanguage, setContentLanguage] = useState<TrainingContentLanguage>(
    DEFAULT_TRAINING_CONTENT_LANGUAGE
  );
  const [passingScore, setPassingScore] = useState(70);
  const [status, setStatus] = useState<TrainingProgramStatus>('draft');

  // Document states
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [docScope, setDocScope] = useState<'role' | 'organization'>('role');
  const [isDragging, setIsDragging] = useState(false);
  const [parsingDocs, setParsingDocs] = useState(false);
  // Estado por archivo del último lote. Sobrevive a `uploadFiles`: los archivos
  // procesados se retiran de la lista de pendientes pero su fila sigue visible.
  const [uploadStates, setUploadStates] = useState<UploadItemState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Controlador del OCR en curso. Vive en una referencia y no en el estado
  // porque cancelar no debe volver a renderizar por sí mismo: el cambio visible
  // llega por el estado del archivo, cuando el OCR se detiene de verdad.
  const ocrAbortRef = useRef<AbortController | null>(null);

  // Module states
  const [generatingModules, setGeneratingModules] = useState(false);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  // Aviso de la última generación. Persiste en pantalla (el toast se
  // autodescarta a los 4 s y aquí hay detalle por documento que el
  // administrador necesita poder leer con calma).
  const [contextNotice, setContextNotice] = useState<GenerationContextNotice | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [versioning, setVersioning] = useState(false);
  // `warning` existe para el resultado parcial del lote: hubo documentos
  // cargados y documentos fallidos, y ninguno de los dos colores anteriores
  // describe eso sin mentir (Requisito 2.4).
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Determinar si el programa es de solo lectura (todo excepto borrador es read-only)
  const isReadOnly = program ? program.status !== 'draft' : false;

  // La generación con IA solo usa documentos ya procesados (status 'ready');
  // el backend rechaza la llamada si ninguno lo está.
  const readyDocumentsCount = documents.filter((doc) => doc.status === 'ready').length;

  // Archivo en vuelo del lote (el recorrido es secuencial, así que hay uno o
  // ninguno). Alimenta la región en vivo del panel de progreso.
  const activeUploadItem = uploadStates.find(
    (item) =>
      item.status === 'uploading' || item.status === 'ocr' || item.status === 'processing'
  );
  const uploadAnnouncement = describeUploadStep(activeUploadItem, language);

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
        setContentLanguage(
          resolveTrainingContentLanguage(data.program.contentLanguage)
        );
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

  // Al salir de la pantalla no queda nadie para ver el progreso, pero el OCR
  // seguiría quemando el hilo página a página. La señal lo corta en el siguiente
  // corte cooperativo; el flujo de subida ya trata la cancelación como «sigue
  // sin texto de OCR».
  useEffect(() => () => ocrAbortRef.current?.abort(), []);

  const showToast = (type: 'success' | 'warning' | 'error', message: string) => {
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
    addSelectedFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.target.files) {
      addSelectedFiles(Array.from(e.target.files));
    }
    // Permite volver a elegir el mismo archivo después de retirarlo de la lista:
    // sin esto el input no dispara `change` con la misma selección.
    e.target.value = '';
  };

  /**
   * Abre el selector de archivos del sistema.
   *
   * Lo comparten dos disparadores: el clic en cualquier punto de la zona de
   * arrastre (comodidad de ratón, como antes) y el botón real que la acompaña,
   * que es el único camino operable con teclado.
   */
  const openFilePicker = () => {
    if (isReadOnly || parsingDocs) return;
    fileInputRef.current?.click();
  };

  /**
   * Añade archivos a la cola descartando duplicados y respetando el tope del
   * lote. El duplicado se descarta porque el flujo por archivo lo emparejaría
   * con la misma fila del panel y el servidor lo deduplicaría por checksum de
   * todos modos: subirlo dos veces solo produce ruido.
   */
  const addSelectedFiles = (files: File[]) => {
    if (isReadOnly || parsingDocs || files.length === 0) return;

    const existingKeys = new Set(uploadFiles.map(buildFileKey));
    const accepted: File[] = [];
    let duplicates = 0;

    for (const file of files) {
      const key = buildFileKey(file);
      if (existingKeys.has(key)) {
        duplicates += 1;
        continue;
      }
      existingKeys.add(key);
      accepted.push(file);
    }

    const room = Math.max(0, MAX_UPLOAD_BATCH - uploadFiles.length);
    const admitted = accepted.slice(0, room);
    const rejected = accepted.length - admitted.length;

    if (admitted.length > 0) {
      setUploadFiles((prev) => [...prev, ...admitted]);
    }

    if (rejected > 0) {
      showToast(
        'error',
        language === 'es'
          ? `Solo puedes subir ${MAX_UPLOAD_BATCH} archivos por lote. Se omitieron ${rejected}.`
          : `You can only upload ${MAX_UPLOAD_BATCH} files per batch. ${rejected} were skipped.`
      );
      return;
    }

    if (duplicates > 0) {
      showToast(
        'error',
        language === 'es'
          ? `Se omitieron ${duplicates} archivos ya presentes en la lista.`
          : `${duplicates} files already in the list were skipped.`
      );
    }
  };

  const removeUploadFile = (index: number) => {
    if (parsingDocs) return;
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

  const patchUploadState = (key: string, patch: Partial<UploadItemState>) => {
    setUploadStates((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const isPdfFile = (file: File) =>
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  /**
   * Escribe el detalle del OCR sin renderizar de más.
   *
   * Devuelve el mismo array cuando el detalle ya era idéntico, de modo que React
   * no vuelve a renderizar: el motor de OCR informa del avance muchas veces por
   * página y buena parte de esos avisos no cambian nada visible.
   */
  const patchOcrState = (key: string, ocr: UploadOcrState) => {
    setUploadStates((prev) => {
      let changed = false;

      const next = prev.map((item) => {
        if (item.key !== key) return item;
        if (item.ocr && shallowEqualOcr(item.ocr, ocr)) return item;

        changed = true;
        return { ...item, ocr };
      });

      return changed ? next : prev;
    });
  };

  /**
   * Reconoce el texto de un PDF escaneado en el navegador.
   *
   * Devuelve el texto solo cuando de verdad hizo falta OCR. Si el PDF trae capa
   * de texto no se ejecuta nada: el servidor extrae su propio texto de los bytes
   * del bucket, que es la fuente preferible siempre que exista.
   *
   * Nunca lanza. Un fallo o una cancelación del OCR no invalidan la subida: el
   * documento se procesa igual y queda en `needs_ocr`, exactamente como antes de
   * que existiera este paso. Perder el OCR es peor que perder el documento.
   */
  const runClientOcr = async (file: File, key: string): Promise<string | undefined> => {
    const controller = new AbortController();
    ocrAbortRef.current = controller;

    patchUploadState(key, {
      status: 'ocr',
      reason: undefined,
      ocr: { stage: 'running', phase: 'text-layer', page: 0, totalPages: 0, pageProgress: 0 },
    });

    try {
      // Carga diferida: `pdfjs-dist` y `tesseract.js` solo se descargan aquí, la
      // primera vez que un lote contiene un PDF.
      const { extractTrainingTextFromPdf } = await import('@/lib/training/client-ocr');

      const result: ClientPdfTextResult = await extractTrainingTextFromPdf(file, {
        contentLanguage,
        maxPages: OCR_PAGE_LIMIT,
        signal: controller.signal,
        onProgress: (progress) => {
          patchOcrState(key, {
            stage: 'running',
            phase: progress.phase,
            page: progress.page,
            totalPages: progress.totalPages,
            pageProgress: quantizePageProgress(progress.pageProgress),
          });
        },
      });

      if (result.source === 'text-layer') {
        // El PDF tenía capa de texto: no se ejecutó OCR y no hay nada que
        // enviar. Se borra el detalle para que la fila no muestre un paso que
        // en la práctica no ocurrió.
        patchUploadState(key, { ocr: undefined });
        return undefined;
      }

      patchUploadState(key, {
        ocr: {
          stage: 'done',
          pagesProcessed: result.pagesProcessed,
          totalPages: result.totalPages,
          partial: result.partial,
        },
      });

      return result.text;
    } catch (err: unknown) {
      // Los errores del módulo se distinguen por `name` y no con `instanceof`:
      // la clase llega por un `import()` dinámico y comparar por identidad ataría
      // este manejo a que el empaquetador entregue exactamente la misma
      // instancia del módulo. El `name` es parte del contrato del módulo.
      const name = err instanceof Error ? err.name : '';

      if (name === 'ClientOcrAbortedError') {
        patchUploadState(key, { ocr: { stage: 'cancelled' } });
        return undefined;
      }

      if (name === 'ClientOcrEmptyResultError') {
        patchUploadState(key, { ocr: { stage: 'failed', cause: 'empty' } });
        return undefined;
      }

      // Cualquier otro fallo (PDF cifrado, motor que no carga, memoria) se
      // registra y se sigue: el documento acabará en `needs_ocr`.
      console.error('[training/configure] Client OCR failed', err);
      patchUploadState(key, { ocr: { stage: 'failed', cause: 'error' } });
      return undefined;
    } finally {
      ocrAbortRef.current = null;
    }
  };

  /**
   * Detiene el OCR del documento en curso.
   *
   * Solo cancela el OCR, no el lote: el archivo ya está en el bucket, se
   * procesa sin texto reconocido y los archivos siguientes continúan.
   */
  const cancelClientOcr = () => {
    ocrAbortRef.current?.abort();
  };

  /**
   * Sube y procesa **un** archivo con el flujo de tres pasos.
   *
   * 1. `POST /api/training/documents/upload-url` — JSON pequeño, así que el
   *    límite de tamaño de cuerpo de la plataforma no interviene.
   * 2. `uploadToSignedUrl` — el archivo va del navegador directamente al bucket.
   *    El bucket es privado, pero el token firmado del paso 1 autoriza la
   *    escritura sin necesidad de permisos de sesión sobre el bucket.
   * 3. `POST /api/training/documents/process` — el servidor descarga el objeto y
   *    valida los bytes reales, extrae el texto, indexa y asocia al programa.
   *
   * Devuelve `true` solo si el paso 3 confirmó el documento. Nunca lanza: cada
   * fallo se traduce a un motivo visible en la fila del archivo, porque un lote
   * no debe interrumpirse por un archivo malo.
   */
  const uploadSingleDocument = async (file: File, key: string): Promise<boolean> => {
    const genericUploadError =
      language === 'es'
        ? 'No se pudo preparar la subida del archivo.'
        : 'The file upload could not be prepared.';
    const genericProcessError =
      language === 'es'
        ? 'No se pudo procesar el documento.'
        : 'The document could not be processed.';

    try {
      // ── Paso 1: URL firmada ──
      patchUploadState(key, { status: 'uploading', reason: undefined });

      const urlRes = await fetch('/api/training/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          scope: docScope,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      const urlBody = await urlRes.json().catch(() => ({} as Record<string, unknown>));

      if (!urlRes.ok) {
        // `upload-url` ya devuelve texto accionable en `error` (tamaño,
        // extensión, programa publicado), así que se muestra tal cual.
        patchUploadState(key, {
          status: 'failed',
          reason: typeof urlBody?.error === 'string' ? urlBody.error : genericUploadError,
        });
        return false;
      }

      const { documentId, storagePath, token } = urlBody as {
        documentId?: string;
        storagePath?: string;
        token?: string;
      };

      if (!documentId || !storagePath || !token) {
        patchUploadState(key, { status: 'failed', reason: genericUploadError });
        return false;
      }

      // ── Paso 2: subida directa del navegador al bucket ──
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(TRAINING_DOCUMENTS_BUCKET)
        .uploadToSignedUrl(storagePath, token, file);

      if (uploadError) {
        // Aquí no hay mensaje del servidor que traducir: el error viene de
        // storage. El caso más probable es que el archivo exceda el
        // `file_size_limit` del bucket o que la red se cortara a medias.
        console.error('[training/configure] Signed upload failed', uploadError);
        patchUploadState(key, {
          status: 'failed',
          reason:
            language === 'es'
              ? `No se pudo subir el archivo al almacenamiento. Comprueba tu conexión y que no exceda ${MAX_TRAINING_FILE_SIZE_MB} MB.`
              : `The file could not be uploaded to storage. Check your connection and that it does not exceed ${MAX_TRAINING_FILE_SIZE_MB} MB.`,
        });
        return false;
      }

      // ── Paso 2.b: OCR en el navegador, solo para PDF ──
      // Se hace después de la subida y antes del procesamiento: si el OCR falla
      // o se cancela, el archivo ya está en el bucket y el servidor lo procesa
      // igual. Solo se intenta con PDF porque es el único tipo cuyo fallo de
      // extracción significa «escaneado».
      const ocrText = isPdfFile(file) ? await runClientOcr(file, key) : undefined;

      // ── Paso 3: procesamiento en el servidor ──
      patchUploadState(key, { status: 'processing' });

      const processRes = await fetch('/api/training/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          scope: docScope,
          documentId,
          storagePath,
          fileName: file.name,
          // El servidor lo ignora si su propia extracción alcanza el umbral: no
          // es una sustitución del texto del PDF, es el único texto disponible
          // cuando el PDF no tiene capa de texto.
          ...(ocrText ? { ocrText } : {}),
        }),
      });

      const processBody = await processRes
        .json()
        .catch(() => ({} as Record<string, any>));

      if (!processRes.ok || processBody?.success !== true) {
        // `failure.message` ya viene traducido y sin causa técnica; el `error`
        // plano cubre autorización y validación de forma del cuerpo.
        const reason =
          (typeof processBody?.failure?.message === 'string' && processBody.failure.message) ||
          (typeof processBody?.error === 'string' && processBody.error) ||
          genericProcessError;

        patchUploadState(key, { status: 'failed', reason });
        return false;
      }

      patchUploadState(key, { status: 'done', reason: undefined });
      return true;
    } catch (err: any) {
      // Fallo de red o de parseo: el archivo queda pendiente para reintentar.
      console.error('[training/configure] Upload flow failed', err);
      patchUploadState(key, {
        status: 'failed',
        reason:
          language === 'es'
            ? 'Error de red durante la subida. Vuelve a intentarlo.'
            : 'Network error during upload. Try again.',
      });
      return false;
    }
  };

  /**
   * Recorre el lote **en secuencia**, un archivo por vez.
   *
   * En paralelo el progreso sería ilegible (varias filas cambiando a la vez) y
   * cada `process` mantiene abierta una petición de hasta 60 s con extracción de
   * texto y análisis de IA: lanzarlas todas juntas solo adelanta el momento en
   * que alguna expira.
   */
  const handleUploadDocuments = async () => {
    if (isReadOnly || parsingDocs || uploadFiles.length === 0) return;

    const batch = uploadFiles.map((file) => ({ file, key: buildFileKey(file) }));

    setUploadStates(
      batch.map(({ file, key }) => ({ key, fileName: file.name, status: 'pending' as const }))
    );
    setParsingDocs(true);

    const processedKeys = new Set<string>();

    try {
      for (const { file, key } of batch) {
        const processed = await uploadSingleDocument(file, key);
        if (processed) processedKeys.add(key);
      }
    } finally {
      setParsingDocs(false);
    }

    // Solo se retiran los archivos que el servidor confirmó. Los fallidos se
    // conservan para poder reintentar sin volver a seleccionarlos.
    setUploadFiles((prev) => prev.filter((file) => !processedKeys.has(buildFileKey(file))));

    await loadLibraryDocuments();

    const processedCount = processedKeys.size;
    const failedCount = batch.length - processedCount;

    if (failedCount === 0) {
      showToast(
        'success',
        language === 'es'
          ? `${processedCount} documento(s) cargado(s) y procesado(s)`
          : `${processedCount} document(s) uploaded and processed`
      );
    } else if (processedCount > 0) {
      showToast(
        'warning',
        language === 'es'
          ? `${processedCount} documento(s) cargado(s), ${failedCount} con errores`
          : `${processedCount} document(s) uploaded, ${failedCount} failed`
      );
    } else {
      showToast(
        'error',
        language === 'es'
          ? `Ningún documento se pudo procesar (${failedCount} con errores)`
          : `No documents could be processed (${failedCount} failed)`
      );
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
    setContextNotice(null);
    try {
      const res = await fetch('/api/training/generate-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // El `code` distingue los cuatro fallos que antes compartían un `502`
        // opaco. El `error` de la respuesta queda como respaldo para los fallos
        // que no son de IA (programa no draft, sin documentos ready, etc.).
        const mapped =
          typeof body.code === 'string'
            ? GENERATE_MODULES_ERROR_MESSAGES[body.code]
            : undefined;

        throw new Error(
          mapped
            ? (language === 'es' ? mapped.es : mapped.en)
            : body.error || (language === 'es' ? 'No se pudieron generar los módulos' : 'Failed to generate modules')
        );
      }

      const data = await res.json();
      if (data.modules && Array.isArray(data.modules)) {
        setModules(data.modules);

        // Campo añadido por el servidor: ausente cuando todo el material cupo.
        const notice = parseContextNotice(data.contextNotice);
        setContextNotice(notice);

        if (notice) {
          // Se reutiliza el toast 'warning', el mismo que el lote de subida usa
          // para "salió bien, pero no del todo". El detalle va en el panel: el
          // toast solo dirige la atención hacia él.
          showToast(
            'warning',
            language === 'es'
              ? 'Módulos generados. Parte del material no entró en el contexto: revisa el aviso.'
              : 'Modules generated. Some material did not fit the context: see the notice.'
          );
        } else {
          showToast('success', language === 'es' ? 'Módulos generados con éxito' : 'Modules generated successfully');
        }
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
        contentLanguage,
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
      {/*
        Toast como REGIÓN EN VIVO.

        No lo era: el resultado del lote de subida («3 documento(s) cargado(s), 2
        con errores») y el de la generación existían solo como color y texto en
        una esquina, se autodescartaban a los 4 s y un lector de pantalla no
        anunciaba ninguno. El administrador que no ve la esquina se quedaba sin
        saber cómo acabó la acción que acababa de lanzar.

        El rol depende del tipo, porque los tres desenlaces no interrumpen igual:

        - `error` y `warning` → `role="alert"` (implícitamente `assertive`).
          Cambian lo que hay que hacer a continuación: documentos que no se
          procesaron y siguen en la lista para reintentar, o material que no entró
          en el contexto y espera en el panel de aviso. Interrumpir es lo correcto,
          y es además el patrón de alerta de ARIA, que se anuncia al insertarse el
          nodo con su contenido.
        - `success` → `role="status"` (implícitamente `polite`). Confirma lo que se
          acaba de pedir, así que espera su turno en vez de cortar la lectura en
          curso.

        `aria-atomic` hace que se lea el mensaje completo y no solo el fragmento
        que cambió cuando un toast reemplaza a otro. El color del error pasa a
        usar el token `danger` (mismo valor que tenía a mano) para no dejar un
        color de paleta suelto en el único elemento sin tokenizar del bloque.
      */}
      {toast && (
        <div
          role={toast.type === 'success' ? 'status' : 'alert'}
          aria-atomic="true"
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-300 text-white font-medium ${
            toast.type === 'success' ? 'bg-success' : toast.type === 'warning' ? 'bg-warning' : 'bg-danger'
          }`}
        >
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

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {language === 'es' ? 'Idioma del Contenido' : 'Content Language'}
            </label>
            <select
              value={contentLanguage}
              disabled={isReadOnly}
              onChange={(e) =>
                setContentLanguage(resolveTrainingContentLanguage(e.target.value))
              }
              className="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm disabled:opacity-60"
            >
              <option value="es">{language === 'es' ? 'Español' : 'Spanish'}</option>
              <option value="en">{language === 'es' ? 'Inglés' : 'English'}</option>
            </select>
            <p className="mt-1.5 text-xs text-muted">
              {language === 'es'
                ? 'Cambiarlo no retraduce los módulos ya generados: hay que regenerarlos.'
                : 'Changing it does not retranslate existing modules: regenerate them.'}
            </p>
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

            {/*
              Zona de arrastre + botón real.

              Antes era un `div` con `onClick` y nada más: con teclado no había
              forma de abrir el selector, así que la única vía de subir un
              documento exigía ratón. Se deja el `div` como zona de arrastre —los
              eventos de arrastre solo tienen sentido sobre un contenedor— y la
              operabilidad la aporta un `<button>` de verdad dentro de él.

              Por qué el botón y no `role="button" + tabIndex` en el contenedor:
              el rol `button` marca a sus descendientes como presentacionales, así
              que las tres líneas de ayuda (formatos, tope del lote, aviso del
              OCR) se aplastarían dentro del nombre accesible y se leerían como
              parte del propio botón. Además el botón trae Enter y Espacio del
              navegador, sin manejador de teclas que mantener sincronizado, y el
              estado `parsingDocs` se expresa con `disabled` en vez de inventar
              un `aria-disabled` sobre un `div`. El `input[type=file]` sigue fuera
              del botón: anidarlo dentro sería HTML inválido.
            */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={openFilePicker}
              className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all ${
                parsingDocs ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
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
              <button
                type="button"
                onClick={(event) => {
                  // El contenedor también abre el selector: sin esto el clic en
                  // el botón burbujearía y lo abriría dos veces.
                  event.stopPropagation();
                  openFilePicker();
                }}
                disabled={parsingDocs}
                className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {language === 'es' ? 'Seleccionar archivos' : 'Select files'}
              </button>
              <p className="text-xs text-muted mt-3">
                {language === 'es'
                  ? `PDF, DOCX, TXT, MD (Máx ${MAX_TRAINING_FILE_SIZE_MB} MB · hasta ${MAX_UPLOAD_BATCH} archivos por lote)`
                  : `PDF, DOCX, TXT, MD (Max ${MAX_TRAINING_FILE_SIZE_MB} MB · up to ${MAX_UPLOAD_BATCH} files per batch)`}
              </p>
              <p className="text-xs text-muted mt-1 text-center">
                {language === 'es'
                  ? `Los PDF escaneados se leen con OCR en este navegador (hasta ${OCR_PAGE_LIMIT} páginas). Deja la pestaña abierta mientras avanza.`
                  : `Scanned PDFs are read with OCR in this browser (up to ${OCR_PAGE_LIMIT} pages). Keep the tab open while it runs.`}
              </p>
            </div>

            {/* Panel de progreso por archivo: sustituye al spinner opaco anterior */}
            {uploadStates.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-background p-3 space-y-2">
                {/*
                  Región en vivo del lote. Se monta con el panel, antes de que
                  haya avances que anunciar, porque un `role="status"` que
                  aparece ya con texto no siempre se lee. El detalle visible de
                  cada fila queda fuera de la región: repetir cada 5 % de una
                  barra convertiría el anuncio en ruido.
                */}
                <p role="status" className="sr-only">
                  {uploadAnnouncement}
                </p>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                    {language === 'es' ? 'Progreso de la subida' : 'Upload progress'}
                    {' '}
                    ({uploadStates.filter((item) => item.status === 'done').length}/{uploadStates.length})
                  </p>
                  {!parsingDocs && (
                    <button
                      type="button"
                      onClick={() => setUploadStates([])}
                      className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
                      title={language === 'es' ? 'Ocultar detalle' : 'Hide details'}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {uploadStates.map((item) => (
                    <div key={item.key} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 flex-shrink-0">
                        {item.status === 'pending' && <Clock className="h-3.5 w-3.5 text-muted" />}
                        {(item.status === 'uploading' ||
                          item.status === 'ocr' ||
                          item.status === 'processing') && (
                          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                        )}
                        {item.status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-success" />}
                        {item.status === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground truncate max-w-[260px]">{item.fileName}</span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              item.status === 'done'
                                ? 'text-success'
                                : item.status === 'failed'
                                  ? 'text-red-500'
                                  : 'text-muted'
                            }`}
                          >
                            {item.status === 'pending' && (language === 'es' ? 'En espera' : 'Queued')}
                            {item.status === 'uploading' && (language === 'es' ? 'Subiendo' : 'Uploading')}
                            {item.status === 'ocr' && (language === 'es' ? 'Leyendo texto' : 'Reading text')}
                            {item.status === 'processing' && (language === 'es' ? 'Procesando' : 'Processing')}
                            {item.status === 'done' && (language === 'es' ? 'Procesado' : 'Processed')}
                            {item.status === 'failed' && (language === 'es' ? 'Fallido' : 'Failed')}
                          </span>
                        </div>
                        {item.status === 'failed' && item.reason && (
                          <p className="text-[11px] text-red-500 mt-0.5">{item.reason}</p>
                        )}
                        {item.ocr && (
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p
                                className={`text-[11px] ${
                                  isOcrStateNoteworthy(item.ocr) ? 'text-warning' : 'text-muted'
                                }`}
                              >
                                {describeOcrState(item.ocr, language)}
                              </p>
                              {item.status === 'ocr' && item.ocr.stage === 'running' && (
                                <button
                                  type="button"
                                  onClick={cancelClientOcr}
                                  aria-label={
                                    language === 'es'
                                      ? `Cancelar el reconocimiento de texto de ${item.fileName}`
                                      : `Cancel text recognition for ${item.fileName}`
                                  }
                                  className={`inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-0.5 text-[10px] font-semibold text-muted transition-colors hover:text-foreground hover:bg-card-hover ${focusRing}`}
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                                </button>
                              )}
                            </div>
                            {item.ocr.stage === 'running' && item.ocr.totalPages > 0 && (
                              // Duplica en forma gráfica lo que la frase de
                              // arriba ya dice, así que se oculta al lector de
                              // pantalla en lugar de anunciarlo dos veces.
                              <div
                                aria-hidden="true"
                                className="h-1 w-full max-w-[240px] rounded-full bg-border/60 overflow-hidden"
                              >
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${ocrPercent(item.ocr)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  disabled={parsingDocs}
                  className="p-1 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              onClick={handleUploadDocuments}
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

        {/*
          Aviso de contexto de la última generación.

          Mismo lenguaje visual que el aviso de «solo lectura» de arriba, porque
          es lo mismo: información que condiciona la siguiente decisión del
          administrador, no un fallo. Los módulos existen y están guardados; lo
          que hay que saber es que se escribieron sin ver todo el material, y qué
          hacer al respecto.
        */}
        {contextNotice && (
          <div className="p-4 rounded-xl bg-warning/15 border border-warning/30 flex items-start gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-warning mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {language === 'es'
                  ? 'La IA no vio todo el material'
                  : 'The AI did not see all the material'}
              </p>
              <p className="text-xs text-muted">
                {language === 'es'
                  ? 'Los módulos se generaron y se guardaron, pero el material asociado no cabe entero en el contexto del modelo. Lo que quedó fuera no está representado en los módulos: divide el programa en varios más pequeños, o quita documentos de este, y vuelve a generar.'
                  : 'The modules were generated and saved, but the associated material does not fit the model context in full. Whatever was left out is not represented in the modules: split the program into smaller ones, or detach documents from this one, and generate again.'}
              </p>

              {contextNotice.truncatedDocuments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {language === 'es' ? 'Documentos recortados' : 'Truncated documents'}
                  </p>
                  <ul className="space-y-0.5">
                    {contextNotice.truncatedDocuments.map((doc, idx) => (
                      <li key={`${doc.fileName}-${idx}`} className="text-xs text-foreground">
                        <span className="font-medium break-words">{doc.fileName}</span>
                        <span className="text-muted">
                          {language === 'es'
                            ? ` — se usaron ${formatChars(doc.includedChars, language)} de ${formatChars(
                                doc.includedChars + doc.omittedChars,
                                language
                              )} caracteres (quedaron fuera ${formatChars(doc.omittedChars, language)})`
                            : ` — ${formatChars(doc.includedChars, language)} of ${formatChars(
                                doc.includedChars + doc.omittedChars,
                                language
                              )} characters were used (${formatChars(doc.omittedChars, language)} left out)`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {contextNotice.documentsOmittedByLimit > 0 && (
                <p className="text-xs text-foreground">
                  {language === 'es'
                    ? `${contextNotice.documentsOmittedByLimit} documento(s) asociados no entraron en la generación: solo se envían los ${contextNotice.documentLimit} más recientes.`
                    : `${contextNotice.documentsOmittedByLimit} associated document(s) were left out of the generation: only the ${contextNotice.documentLimit} most recent ones are sent.`}
                </p>
              )}

              {contextNotice.budgetChars > 0 && (
                <p className="text-[11px] text-muted">
                  {language === 'es'
                    ? `Presupuesto de contexto: ${formatChars(contextNotice.budgetChars, language)} caracteres.`
                    : `Context budget: ${formatChars(contextNotice.budgetChars, language)} characters.`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setContextNotice(null)}
              aria-label={language === 'es' ? 'Ocultar el aviso de contexto' : 'Hide the context notice'}
              className={`p-1 rounded-lg text-muted transition-colors hover:text-foreground hover:bg-card ${focusRing}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

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
