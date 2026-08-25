export interface Question {
  id: string;               // e.g. "q11a"
  number: string;           // display label, e.g. "11(a)"
  normalizedNumber: string; // for matching, e.g. "11a"
  text: string;
  maxMarks?: number;
  order: number;             // printed order index
}

export interface BBox {
  page: number; // 0-indexed page of the answer sheet
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number; // normalized 0-1000
}

export interface ExtractedAnswer {
  id: string;
  detectedLabel: string | null;
  text: string;
  regions: BBox[];
}

export interface MappedAnswer {
  question: Question | null;
  answer: ExtractedAnswer | null;
  matchConfidence: 'label' | 'semantic' | 'none';
  grading?: {
    marksAwarded: number;
    maxMarks: number;
    verdict: 'correct' | 'partial' | 'incorrect' | 'ungraded';
    feedback: string;
  };
}

export interface SessionData {
  sessionId: string;
  questionPaperImages: string[];
  answerSheetImages: string[];
  questions: Question[];
  extractedAnswers: ExtractedAnswer[];
  mappedAnswers: MappedAnswer[];
  overallFeedback?: string;
  totalScore?: { awarded: number; max: number };
}
