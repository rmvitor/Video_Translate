import type { Project } from './types';

const DATABASE = 'entrelinhas-local';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = action(tx.objectStore('projects'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? request.error); };
  });
}

export const listProjects = () => transaction('readonly', store => store.getAll()) as Promise<Project[]>;
export const saveProject = (project: Project) => transaction('readwrite', store => store.put(project));
export const deleteProject = (id: string) => transaction('readwrite', store => store.delete(id));

export async function removeLocalData() {
  await transaction('readwrite', store => store.clear());
  // Model weights live in the Transformers.js cache, separate from the app shell.
  for (const name of await caches.keys()) {
    if (name === 'transformers-cache') await caches.delete(name);
  }
}
