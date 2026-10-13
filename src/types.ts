export type Segment = { start: number; end: number; original: string; translated: string };
export type Project = {
  id: string;
  title: string;
  filename: string;
  size: number;
  lastModified: number;
  duration: number;
  createdAt: number;
  segments: Segment[];
  video?: Blob;
};

export type WorkerEvent =
  | { type: 'status'; stage: 'audio' | 'models' | 'transcribe' | 'translate'; message: string; progress?: number }
  | { type: 'complete'; segments: Segment[] }
  | { type: 'transcribed'; segments: Segment[] }
  | { type: 'error'; message: string };
