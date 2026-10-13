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
  collectionId?: string;
  subjectId?: string;
};

export type Assignment = { collectionId?: string; subjectId?: string };
export type LearningProject = { id: string; title: string; createdAt: number; subjects: { id: string; title: string }[] };
export type PdfBlock = { id: string; original: string; translated: string; y: number; heading: boolean };
export type PdfImage = { id: string; blob: Blob; width: number; height: number; y: number; displayWidth?: number; blank?: boolean };
export type PdfPage = { number: number; blocks: PdfBlock[]; images: PdfImage[]; preview: Blob };
export type PdfDocument = Assignment & { id: string; title: string; filename: string; createdAt: number; pages: PdfPage[] };

export type WorkerEvent =
  | { type: 'status'; stage: 'audio' | 'models' | 'transcribe' | 'translate'; message: string; progress?: number }
  | { type: 'complete'; segments: Segment[] }
  | { type: 'transcribed'; segments: Segment[] }
  | { type: 'text-translated'; id: string; translated: string }
  | { type: 'text-complete' }
  | { type: 'error'; message: string };
