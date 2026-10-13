import type { Project, LearningProject, PdfDocument } from './types';

const LEGACY_DATABASE = 'entrelinhas-local';
let databaseName = LEGACY_DATABASE;
export function setLocalAccount(id: string) { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Conta local inválida.'); databaseName = `${LEGACY_DATABASE}:user:${id}`; }
function open(name = databaseName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      for (const name of ['projects', 'collections', 'documents']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, name = 'projects'): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? request.error); };
  });
}

export const listProjects = () => transaction('readonly', store => store.getAll()) as Promise<Project[]>;
export const saveProject = (project: Project) => transaction('readwrite', store => store.put(project));
export const deleteProject = (id: string) => transaction('readwrite', store => store.delete(id));
export const listCollections = () => transaction('readonly', store => store.getAll(), 'collections') as Promise<LearningProject[]>;
export const saveCollection = (value: LearningProject) => transaction('readwrite', store => store.put(value), 'collections');
export const deleteCollection = (id: string) => transaction('readwrite', store => store.delete(id), 'collections');
export const listDocuments = () => transaction('readonly', store => store.getAll(), 'documents') as Promise<PdfDocument[]>;
export const saveDocument = (value: PdfDocument) => transaction('readwrite', store => store.put(value), 'documents');
export const deleteDocument = (id: string) => transaction('readwrite', store => store.delete(id), 'documents');

export async function saveMaterials(projects:Project[],documents:PdfDocument[]) {
  const db=await open();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['projects','documents'],'readwrite');
    for(const project of projects)tx.objectStore('projects').put(project);
    for(const document of documents)tx.objectStore('documents').put(document);
    tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

export async function removeLocalData() {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'collections', 'documents'], 'readwrite');
    for (const name of ['projects', 'collections', 'documents']) tx.objectStore(name).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
  // Model weights live in the Transformers.js cache, separate from the app shell.
  for (const name of await caches.keys()) {
    if (name === 'transformers-cache' || name === 'entrelinhas-voice-v1') await caches.delete(name);
  }
}

export type LocalSnapshot = { projects: Project[]; collections: LearningProject[]; documents: PdfDocument[] };
export async function localSnapshot(legacy = false): Promise<LocalSnapshot> {
  const db = await open(legacy ? LEGACY_DATABASE : databaseName);
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['projects','collections','documents']);
    const projects = tx.objectStore('projects').getAll(), collections = tx.objectStore('collections').getAll(), documents = tx.objectStore('documents').getAll();
    tx.oncomplete = () => { db.close();resolve({ projects: projects.result, collections: collections.result, documents: documents.result }); };
    tx.onabort = tx.onerror = () => { db.close();reject(tx.error); };
  });
}
export async function mergeSnapshot(snapshot: LocalSnapshot) {
  const db = await open();
  return new Promise<{ added: number; skipped: number }>((resolve,reject) => {
    const tx = db.transaction(['projects','collections','documents'],'readwrite'); let added=0,skipped=0;
    for (const name of ['projects','collections','documents'] as const) for (const value of snapshot[name]) {
      const store=tx.objectStore(name),existing=store.get(value.id);
      existing.onsuccess=()=>{ if(existing.result){skipped++;return;}store.add(value);added++; };
    }
    tx.oncomplete=()=>{db.close();resolve({added,skipped});};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||new Error('Não foi possível restaurar o backup.'));};
  });
}
