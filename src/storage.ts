import type { Project, LearningProject, PdfDocument } from './types';

const DATABASE = 'entrelinhas-local';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
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
    if (name === 'transformers-cache') await caches.delete(name);
  }
}
