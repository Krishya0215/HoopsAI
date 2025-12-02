export interface VideoEvent {
  id: string;
  type: 'DUNK' | '3POINT' | 'STEAL' | 'BLOCK' | 'ASSIST' | 'HIGHLIGHT' | 'OTHER';
  startTime: number;
  endTime: number;
  description: string;
  confidence: number;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  action?: 'analyzing' | 'clipping' | 'generating_audio' | 'completed';
}

export interface VideoFilter {
  name: string;
  cssFilter: string;
  overlayColor?: string;
  blendMode?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  EDITING = 'EDITING',
}