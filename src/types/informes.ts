// ============================================================
// MÓDULO INFORMES: Tipos TypeScript
// ============================================================

export interface CourseTopicGuide {
  id: string;
  label: string;            // Nombre del tema (ej: "Beneficios", "Módulos", "Inversión")
  talkingPoints: string[];  // Puntos clave que la IA debe mencionar
  order: number;            // Orden de presentación
  duration?: number;        // Minutos estimados para este tema
}

export interface ObjectionResponse {
  trigger: string;          // Frase/tipo de objeción (ej: "precio", "tiempo", "dudas")
  response: string;         // Respuesta sugerida para la IA
  strategy: string;         // Técnica utilizada (ej: "reframe", "urgency", "testimonial")
}

export interface Course {
  id: string;
  orgId: string;
  name: string;
  description: string;
  objectives: string[];
  benefits: string[];
  targetAudience: string;
  durationInfo: string;
  modality: 'presencial' | 'online' | 'hibrido';
  sessionDuration: number;  // Duración de la sesión de informes en minutos
  topics: CourseTopicGuide[];
  objectionResponses: Record<string, string>;
  testimonials: string[];
  urgencyHooks: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string;
  orderIndex: number;
}

export interface CoursePlan {
  id: string;
  courseId: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  isRecommended: boolean;
  orderIndex: number;
}

export type InfoSessionStatus = 'active' | 'completed' | 'closed_presential' | 'closed_remote' | 'abandoned';
export type ClosingMode = 'presential' | 'remote';
export type ConversionResult = 'converted' | 'not_converted' | 'pending';

export interface InfoSessionTranscriptEntry {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
  phase?: string;           // Fase actual: 'greeting', 'exploration', 'presentation', 'objection_handling', 'closing'
}

export interface DetectedObjection {
  type: string;             // Tipo de objeción detectada
  clientMessage: string;    // Lo que dijo el cliente
  aiResponse: string;       // Cómo respondió la IA
  resolved: boolean;        // Si se resolvió la objeción
  timestamp: number;
}

export interface InfoSession {
  id: string;
  courseId: string;
  orgId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAge: number | null;
  clientOccupation: string;
  courseFor: string;         // Para quién es el curso
  status: InfoSessionStatus;
  transcript: InfoSessionTranscriptEntry[];
  closingMode: ClosingMode | null;
  coachNotified: boolean;
  objectionsDetected: DetectedObjection[];
  conversionResult: ConversionResult;
  sessionMetadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type CoachNotificationType = 'closing_ready' | 'new_lead' | 'session_started' | 'objection_alert';

export interface CoachNotification {
  id: string;
  orgId: string;
  sessionId: string | null;
  type: CoachNotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}

// Fases de la sesión de informes (UI flow)
export type InfoSessionPhase = 'select' | 'details' | 'session' | 'closing';

// Props para el chat de la IA
export interface InfoChatRequest {
  courseId: string;
  courseName: string;
  courseDescription: string;
  courseObjectives: string[];
  courseBenefits: string[];
  courseModules: CourseModule[];
  coursePlans: CoursePlan[];
  courseTopics: CourseTopicGuide[];
  objectionResponses: Record<string, string>;
  testimonials: string[];
  urgencyHooks: string[];
  targetAudience: string;
  durationInfo: string;
  modality: string;
  // Datos del cliente
  clientName: string;
  clientAge: number | null;
  clientOccupation: string;
  courseFor: string;
  // Estado de la conversación
  recentMessages: InfoSessionTranscriptEntry[];
  language: 'es' | 'en';
  sessionDuration: number;
  timerSeconds: number;
  sessionId: string;
  isClosingPhase: boolean;
}

export interface InfoChatResponse {
  message: string;
  phase: string;
  shouldNotifyCoach: boolean;
  objectionDetected: DetectedObjection | null;
  suggestedClosingMode: ClosingMode | null;
}
