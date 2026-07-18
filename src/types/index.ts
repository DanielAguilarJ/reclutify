export interface CvExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  duration: string;
  responsibilities: string[];
  achievements: string[];
}

export interface CvEducation {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface CvData {
  name: string;
  email: string;
  phone: string;
  summary: string;
  currentTitle: string;
  totalYearsExperience: number;
  experience: CvExperience[];
  education: CvEducation[];
  skills: string[];
  languages: string[];
  certifications: string[];
  redFlags: string[];
}

export interface Candidate {
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  cvData?: CvData;
}

export interface TopicRubric {
  excellent: string;     // What a 9-10 score looks like
  acceptable: string;    // What a 6-8 score looks like
  poor: string;          // What a 0-5 score looks like
  weight: number;        // 1-10, importance for the role
}

export interface Topic {
  id: string;
  label: string;
  score?: number;
  rubric?: TopicRubric;
}

export interface TranscriptEntry {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
  sentiment?: SentimentData;  // Module 5: Sentiment Analysis
}

export interface BiasFlag {
  type: 'linguistic_bias' | 'gender_bias' | 'cultural_bias' | 'age_bias';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface InterviewHighlight {
  quote: string;
  topic: string;
  significance: 'positive' | 'negative';
}

export interface SentimentData {
  confidence: number;       // 0-100
  evasion: boolean;
  keySignals: string[];
}

export interface Evaluation {
  candidateName: string;
  overallScore: number;
  recommendation: 'Strong Hire' | 'Hire' | 'Pass';
  pros: string[];
  cons: string[];
  topicScores: Record<string, number>;
  // Module 7: Enhanced Scorecard
  executiveSummary?: string;
  interviewHighlights?: InterviewHighlight[];
  hiringRisks?: string[];
  onboardingTips?: string[];
  // Module 1: Bias Detection
  biasFlags?: BiasFlag[];
}

export type InterviewMode = 'restricted' | 'internal';

export interface Role {
  id: string;
  title: string;
  topics: Topic[];
  createdAt: number;
  description?: string;
  location?: string;
  salary?: string;
  jobType?: string;
  interviewDuration?: number; // Duración de la entrevista en minutos (default: 30)
  interviewMode?: InterviewMode;
  isPublished?: boolean;
  publishedAt?: number;
  publicToken?: string; // Token para enlace público/general de entrevista
}

export type InterviewPhase = 'details' | 'overview' | 'hardware' | 'interview' | 'complete';

export interface CandidateResult {
  id: string;
  candidate: Candidate;
  roleId: string;
  roleTitle: string;
  date: number;
  status: 'completed' | 'in-progress' | 'pending' | 'pending-evaluation';
  duration?: number;
  videoUrl?: string;
  evaluation?: Evaluation;
  transcript: TranscriptEntry[];
  source?: 'ticket' | 'public_link'; // Origen del candidato
}

export interface InterviewTicket {
  id: string;
  token: string;
  candidateName: string;
  roleId: string;
  language: 'en' | 'es';
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

// ─── Training Center Types ───

export type TrainingProgramStatus =
  | 'draft'
  | 'published'
  | 'archived';

export interface TrainingProgram {
  id: string;
  orgId: string;
  roleId?: string;
  title: string;
  description?: string;
  isDefault: boolean;
  welcomeMessage?: string;
  aiPersonality: string;
  status: TrainingProgramStatus;
  version: number;
  passingScore: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TrainingDocumentScope =
  | 'organization'
  | 'role';

export type TrainingDocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'needs_ocr';

export interface TrainingDocument {
  id: string;
  orgId: string;
  roleId?: string;
  scope: TrainingDocumentScope;
  fileName: string;
  fileType: string;
  fileSize?: number;
  storagePath?: string;
  extractedText?: string;
  aiSummary?: string;
  aiTopics: TrainingDocumentTopic[];
  status: TrainingDocumentStatus;
  processingError?: string;
  checksumSha256?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingDocumentTopic {
  title: string;
  description: string;
  keyPoints: string[];
}

export interface TrainingProgramDocument {
  programId: string;
  documentId: string;
  sortOrder: number;
  required: boolean;
  createdAt: string;
}

export interface TrainingModuleSection {
  title: string;
  body: string;
  keyPoints: string[];
}

export interface TrainingQuestionPublic {
  question: string;
  type: 'multiple_choice' | 'open_ended' | 'true_false';
  options?: string[];
}

export interface TrainingQuestionAdmin extends TrainingQuestionPublic {
  correctAnswer: string;
  explanation?: string;
}

export interface EmployeeTrainingModule extends Omit<TrainingModule, 'evaluationQuestions'> {
  evaluationQuestions: TrainingQuestionPublic[];
}

export interface TrainingModule {
  id: string;
  programId: string;
  title: string;
  description?: string;
  content: {
    sections: TrainingModuleSection[];
  };
  sourceDocumentIds: string[];
  sortOrder: number;
  durationEstimate: number;
  evaluationEnabled: boolean;
  evaluationQuestions: TrainingQuestionAdmin[];
  createdAt: string;
  updatedAt: string;
}

export interface TrainingEmployee {
  id: string;
  orgId: string;
  roleId?: string;
  candidateResultId?: string;
  userId?: string;
  programId: string;

  /*
   * Nunca debe contener el token real en el bootstrap.
   * Puede eliminarse completamente de la interfaz si ningún componente
   * legítimo lo utiliza.
   */
  token?: string;

  email: string;
  name: string;
  roleTitle?: string;
  status: 'active' | 'completed' | 'paused' | 'not_started';
  overallProgress: number;
  overallScore?: number;
  hiredAt: string;
  startedAt?: string;
  completedAt?: string;
  accessExpiresAt?: string;
  accessRevokedAt?: string;
  interviewData: {
    evaluation?: Evaluation;
    transcript?: TranscriptEntry[];
    cvData?: CvData;
  };
  personalizationNotes: {
    strengths?: string[];
    areasToWatch?: string[];
    learningStyle?: string;
    customTips?: string[];
  };
  createdAt: string;
}

export type TrainingProgressStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface TrainingProgress {
  id: string;
  employeeId: string;
  moduleId: string;
  status: TrainingProgressStatus;
  startedAt?: string;
  completedAt?: string;
  score?: number;
  aiFeedback?: string;
  timeSpent: number;
  createdAt: string;
}

export interface TrainingEvaluation {
  id: string;
  employeeId: string;
  moduleId: string;
  questions: TrainingQuestionAdmin[];
  answers: TrainingAnswer[];
  score?: number;
  passed: boolean;
  attempts: number;
  evaluatedAt: string;
}

export interface TrainingAnswer {
  questionIndex: number;
  answer: string;
  isCorrect: boolean;
  aiExplanation?: string;
}

export interface TrainingMessage {
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: number;
  type?: 'text' | 'quiz' | 'feedback' | 'celebration';
  citations?: { fileName: string; snippet: string }[];
}

export interface TrainingSession {
  id: string;
  employeeId: string;
  moduleId?: string;
  sessionType: 'module' | 'general' | 'evaluation';
  messages: TrainingMessage[];
  startedAt: string;
  endedAt?: string;
}

export type TrainingPhase = 'welcome' | 'overview' | 'module' | 'evaluation' | 'complete';

