export interface Candidate {
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
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

export interface Role {
  id: string;
  title: string;
  topics: Topic[];
  createdAt: number;
  description?: string;
  location?: string;
  salary?: string;
  jobType?: string;
}

export type InterviewPhase = 'details' | 'overview' | 'hardware' | 'interview' | 'complete';

export interface CandidateResult {
  id: string;
  candidate: Candidate;
  roleId: string;
  roleTitle: string;
  date: number;
  status: 'completed' | 'in-progress' | 'pending';
  duration?: number;
  videoUrl?: string;
  evaluation?: Evaluation;
  transcript: TranscriptEntry[];
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
