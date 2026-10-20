import {
  Bible,
  BibleReading,
  BibleReflection,
  Devotional,
  DevotionalReading,
  Book,
  ReadingProgress,
  ReadingList,
  ReadingListItem,
  ReadingGoal,
  Bookmark,
  Highlight,
  Annotation,
  UserProfile,
} from '@/types';

const DB_NAME = 'altto_app_db';
const DB_VERSION = 1;

interface DBSchema {
  bibles: Bible;
  bible_readings: BibleReading;
  bible_reflections: BibleReflection;
  devotionals: Devotional;
  devotional_readings: DevotionalReading;
  books: Book;
  reading_progress: ReadingProgress;
  reading_lists: ReadingList;
  reading_list_items: ReadingListItem;
  reading_goals: ReadingGoal;
  bookmarks: Bookmark;
  highlights: Highlight;
  annotations: Annotation;
  blobs: { id: string; data: ArrayBuffer | Blob | string; mimeType: string; name: string; size?: number };
  user_profile: UserProfile;
}

type StoreName = keyof DBSchema;

let dbPromise: Promise<IDBDatabase> | null = null;

export function resetIDB(): void {
  if (dbPromise) {
    dbPromise
      .then((db) => {
        try {
          db.close();
        } catch {}
      })
      .catch(() => {});
    dbPromise = null;
  }
}

export function getIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        const createStore = (
          name: StoreName,
          keyPath: string = 'id',
          indices: { name: string; keyPath: string | string[]; unique?: boolean }[] = []
        ) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            indices.forEach((idx) => store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique }));
          }
        };

        createStore('bibles');
        createStore('bible_readings', 'id', [
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_period_date', keyPath: ['date', 'period'] },
        ]);
        createStore('bible_reflections', 'id', [
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_bible', keyPath: 'bibleId' },
        ]);
        createStore('devotionals');
        createStore('devotional_readings', 'id', [
          { name: 'by_devotional', keyPath: 'devotionalId' },
          { name: 'by_date', keyPath: 'date' },
          { name: 'by_devotional_day', keyPath: ['devotionalId', 'dayNumber'], unique: true },
        ]);
        createStore('books', 'id', [
          { name: 'by_status', keyPath: 'status' },
          { name: 'by_favorite', keyPath: 'isFavorite' },
        ]);
        createStore('reading_progress', 'id', [{ name: 'by_content', keyPath: 'contentId' }]);
        createStore('reading_lists');
        createStore('reading_list_items', 'id', [
          { name: 'by_list', keyPath: 'listId' },
          { name: 'by_book', keyPath: 'bookId' },
        ]);
        createStore('reading_goals', 'id', [{ name: 'by_book', keyPath: 'bookId' }]);
        createStore('bookmarks', 'id', [{ name: 'by_content', keyPath: 'contentId' }]);
        createStore('highlights', 'id', [{ name: 'by_content', keyPath: 'contentId' }]);
        createStore('annotations', 'id', [{ name: 'by_content', keyPath: 'contentId' }]);
        createStore('blobs');
        createStore('user_profile');
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Erro ao abrir IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

export async function dbGetAll<T extends StoreName>(storeName: T): Promise<DBSchema[T][]> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as DBSchema[T][]);
      request.onerror = () => reject(request.error || new Error(`Falha na leitura de ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`Erro na transação de leitura de ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbGet<T extends StoreName>(storeName: T, key: IDBValidKey): Promise<DBSchema[T] | undefined> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as DBSchema[T] | undefined);
      request.onerror = () => reject(request.error || new Error(`Falha na busca em ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`Erro de transação em ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbPut<T extends StoreName>(storeName: T, value: DBSchema[T]): Promise<void> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      let isDone = false;

      tx.onabort = () => {
        if (!isDone) {
          isDone = true;
          const err = tx.error || new Error(`Transação abortada no armazenamento '${storeName}' (possível limite de espaço)`);
          reject(err);
        }
      };

      tx.onerror = () => {
        if (!isDone) {
          isDone = true;
          const err = tx.error || new Error(`Erro na transação de gravação em '${storeName}'`);
          reject(err);
        }
      };

      tx.oncomplete = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      const store = tx.objectStore(storeName);
      const request = store.put(value);

      request.onerror = () => {
        if (!isDone) {
          isDone = true;
          reject(request.error || new Error(`Falha ao gravar no store '${storeName}'`));
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbDelete<T extends StoreName>(storeName: T, key: IDBValidKey): Promise<void> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      let isDone = false;

      tx.onabort = () => {
        if (!isDone) {
          isDone = true;
          reject(tx.error || new Error(`Transação de exclusão cancelada em '${storeName}'`));
        }
      };

      tx.onerror = () => {
        if (!isDone) {
          isDone = true;
          reject(tx.error || new Error(`Erro ao excluir em '${storeName}'`));
        }
      };

      tx.oncomplete = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => {
        if (!isDone) {
          isDone = true;
          reject(request.error || new Error(`Falha ao deletar em '${storeName}'`));
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbClear<T extends StoreName>(storeName: T): Promise<void> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      let isDone = false;

      tx.onabort = () => {
        if (!isDone) {
          isDone = true;
          reject(tx.error || new Error(`Limpeza abortada em '${storeName}'`));
        }
      };

      tx.onerror = () => {
        if (!isDone) {
          isDone = true;
          reject(tx.error || new Error(`Erro ao limpar '${storeName}'`));
        }
      };

      tx.oncomplete = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => {
        if (!isDone) {
          isDone = true;
          reject(request.error || new Error(`Falha ao limpar '${storeName}'`));
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

// Blob helper for large book files and comics
export async function saveBlob(id: string, data: ArrayBuffer | Blob | string, mimeType: string, name: string): Promise<void> {
  const byteLength = data instanceof ArrayBuffer ? data.byteLength : data instanceof Blob ? data.size : data.length;
  await dbPut('blobs', { id, data, mimeType, name, size: byteLength });
}

export async function getBlob(id: string): Promise<{ data: ArrayBuffer | Blob | string; mimeType: string; name: string; size?: number } | undefined> {
  const item = await dbGet('blobs', id);
  return item as any;
}

export async function getBlobAsArrayBuffer(id: string): Promise<ArrayBuffer | null> {
  const item = await getBlob(id);
  if (!item || !item.data) return null;

  if (item.data instanceof ArrayBuffer) {
    return item.data.slice(0);
  }
  if (typeof Blob !== 'undefined' && item.data instanceof Blob) {
    return await item.data.arrayBuffer();
  }
  if (ArrayBuffer.isView(item.data)) {
    const view = item.data as unknown as ArrayBufferView;
    const buf = view.buffer;
    if (buf instanceof ArrayBuffer) {
      return buf.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }
  }
  if (typeof item.data === 'string') {
    try {
      const binary = atob(item.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }
  return null;
}

// Backup Export & Import (Requirement 47)
export async function exportAllDataAsJSON(): Promise<string> {
  const stores: StoreName[] = [
    'bibles',
    'bible_readings',
    'bible_reflections',
    'devotionals',
    'devotional_readings',
    'books',
    'reading_progress',
    'bookmarks',
    'highlights',
    'annotations',
    'reading_lists',
    'reading_list_items',
    'reading_goals',
  ];

  const exportPayload: Record<string, any[]> = {};

  for (const st of stores) {
    exportPayload[st] = await dbGetAll(st);
  }

  return JSON.stringify({
    alttoVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    data: exportPayload,
  }, null, 2);
}

export async function importDataFromJSON(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString);
  if (!parsed || !parsed.data) {
    throw new Error('Arquivo de backup inválido.');
  }

  const stores = Object.keys(parsed.data) as StoreName[];
  for (const st of stores) {
    const items = parsed.data[st];
    if (Array.isArray(items)) {
      for (const item of items) {
        await dbPut(st, item);
      }
    }
  }
}
