export type Stage = 'setup' | 'self_introduction' | 'part1' | 'part2' | 'part3' | 'evaluation';

export interface Message {
  id: string;
  role: 'emily' | 'candidate';
  text: string;
  timestamp: string;
  corrections?: Correction[];
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface CueCard {
  topic: string;
  bullets: string[];
  preparationTimeLeft?: number;
}

export interface ScoreCriterion {
  score: number;
  advice: string;
}

export interface IELTSReport {
  overallBand: number;
  fluency: ScoreCriterion;
  vocabulary: ScoreCriterion;
  grammar: ScoreCriterion;
  pronunciation: ScoreCriterion;
  globalAdvice: string;
}

export interface InterviewState {
  stage: Stage;
  candidateName: string;
  questionCount: number;
  cueCard: CueCard | null;
  history: Message[];
  report: IELTSReport | null;
  part2Duration: number; // in seconds
}
