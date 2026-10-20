import { Book, ReadingList, ReadingListItem, ReadingGoal, BookFormat } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete, saveBlob } from './indexedDB';
import {
  extractCoverFromBuffer,
  calculateChecksum,
  calculateFileChecksum,
  repairBookCover,
  repairAllLibraryBooks,
  optimizeCoverThumbnail,
  setBookCoverFromPdfPage,
  setBookCustomCover,
} from './coverService';

export {
  repairBookCover,
  repairAllLibraryBooks,
  optimizeCoverThumbnail,
  setBookCoverFromPdfPage,
  setBookCustomCover,
};

export async function getBooks(): Promise<Book[]> {
  return await dbGetAll('books');
}

export async function getBookById(id: string): Promise<Book | undefined> {
  return await dbGet('books', id);
}

export async function updateBook(book: Book): Promise<void> {
  book.updatedAt = new Date().toISOString();
  await dbPut('books', book);
}

/**
 * Marks a book as currently being read, updating its lastReadAt, status to in_progress,
 * storing altto_last_read_book_id in localStorage, and dispatching altto_last_read_book_updated.
 */
export async function markBookAsCurrentlyReading(bookId: string): Promise<Book | undefined> {
  try {
    const book = await getBookById(bookId);
    if (book) {
      const now = new Date().toISOString();
      book.lastReadAt = now;
      if (book.status === 'not_started') {
        book.status = 'in_progress';
      }
      book.updatedAt = now;
      await updateBook(book);
      try {
        localStorage.setItem('altto_last_read_book_id', bookId);
        window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId } }));
      } catch {}
      return book;
    }
  } catch (err) {
    console.warn('Error marking book as currently reading:', err);
  }
  return undefined;
}

/**
 * Ensures a book has a real cover extracted and persisted.
 * If missing or fallback, extracts it from the stored binary in IndexedDB.
 */
export async function ensureBookCover(book: Book): Promise<Book> {
  if (
    book.coverUrl &&
    book.coverUrl.trim() !== '' &&
    book.coverSource !== 'fallback' &&
    book.coverStatus !== 'missing'
  ) {
    return book;
  }
  const res = await repairBookCover(book);
  return res.book;
}

export async function ensureAllBookCovers(books: Book[]): Promise<Book[]> {
  const updated = [...books];
  for (let i = 0; i < updated.length; i++) {
    if (!updated[i].coverUrl || updated[i].coverUrl === '' || updated[i].coverSource === 'fallback') {
      updated[i] = await ensureBookCover(updated[i]);
    }
  }
  return updated;
}

export async function deleteBook(id: string): Promise<void> {
  await dbDelete('books', id);
  // Also remove from reading lists, goals, and blobs
  try {
    await dbDelete('blobs', id);
  } catch {}

  const listItems = await dbGetAll('reading_list_items');
  for (const item of listItems) {
    if (item.bookId === id) {
      await dbDelete('reading_list_items', item.id);
    }
  }
  const goals = await dbGetAll('reading_goals');
  for (const goal of goals) {
    if (goal.bookId === id) {
      await dbDelete('reading_goals', goal.id);
    }
  }
}

export async function deleteMultipleBooks(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteBook(id);
  }
}

export async function importBookFromFile(
  file: File,
  overrides?: { title?: string; author?: string; coverUrl?: string; description?: string },
  existingBooksCache?: Book[]
): Promise<Book> {
  if (!file || file.size === 0) {
    throw new Error('Arquivo vazio ou inacessível (0 bytes).');
  }

  const fileName = file.name;
  let ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Fallback to MIME detection if extension is missing or generic
  if (!ext || ext === 'bin' || ext === 'file') {
    if (file.type === 'application/pdf') ext = 'pdf';
    else if (file.type === 'application/epub+zip') ext = 'epub';
  }

  let format: BookFormat = 'txt';
  if (['pdf', 'epub', 'mobi', 'cbz', 'cbr', 'txt'].includes(ext)) {
    format = ext as BookFormat;
  } else if (file.type === 'application/pdf') {
    format = 'pdf';
  } else if (file.type === 'application/epub+zip') {
    format = 'epub';
  } else {
    throw new Error(`Formato .${ext || 'desconhecido'} não suportado. Por favor utilize PDF ou EPUB.`);
  }

  const checksum = await calculateFileChecksum(file);

  // Check if book already exists by checksum or exact filename + size
  const allBooks = existingBooksCache || (await getBooks());
  const existingBook = allBooks.find(
    (b) =>
      b.originalFileChecksum === checksum ||
      (b.originalFileName === fileName && b.originalFileSize === file.size)
  );

  if (existingBook) {
    // If existing book was missing its cover, attempt repair
    if (!existingBook.coverUrl || existingBook.coverSource === 'fallback') {
      try {
        await repairBookCover(existingBook);
      } catch {}
    }
    return existingBook;
  }

  const bookId = `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Save the raw file blob directly into IndexedDB without duplicating JS heap memory
  try {
    await saveBlob(bookId, file, file.type || 'application/octet-stream', fileName);
  } catch (storageErr: any) {
    const isQuota =
      storageErr?.name === 'QuotaExceededError' ||
      (storageErr?.message && storageErr.message.includes('quota'));
    if (isQuota) {
      throw new Error('Espaço de armazenamento esgotado no dispositivo (IndexedDB Quota). Libere espaço.');
    }
    throw new Error(`Falha ao gravar arquivo no armazenamento local: ${storageErr?.message || 'Erro de gravação'}`);
  }

  let detectedTitle = fileName.replace(/\.[^/.]+$/, '');
  let detectedAuthor = 'Autor Desconhecido';
  let detectedDescription = '';
  let totalPages = 1;
  let totalChapters = 1;
  let coverUrl = overrides?.coverUrl || '';
  let coverType = 'image/jpeg';
  let coverSource: Book['coverSource'] = 'fallback';
  let coverStatus: Book['coverStatus'] = 'missing';

  // Read arrayBuffer strictly for metadata/cover extraction and release immediately
  let extractionBuffer: ArrayBuffer | null = null;
  try {
    extractionBuffer = await file.arrayBuffer();
    const extraction = await extractCoverFromBuffer(extractionBuffer, format, fileName);
    if (extraction.coverUrl) {
      coverUrl = extraction.coverUrl;
      coverType = extraction.coverType;
      coverSource = extraction.coverSource;
      coverStatus = 'ready';
    }
    if (extraction.title) detectedTitle = extraction.title;
    if (extraction.author) detectedAuthor = extraction.author;
    if (extraction.description) detectedDescription = extraction.description;
    if (extraction.totalPages) totalPages = extraction.totalPages;
    if (extraction.totalChapters) totalChapters = extraction.totalChapters;
  } catch (extractErr) {
    console.warn(`Aviso na extração de capa/metadados de ${fileName}:`, extractErr);
    coverStatus = 'error';
  } finally {
    // Explicitly release arrayBuffer reference so garbage collector reclaims memory immediately
    extractionBuffer = null;
  }

  // Handle plain text content if applicable
  let textContent = '';
  if (format === 'txt') {
    try {
      textContent = await file.text();
      const paragraphs = textContent.split(/\n\n+/);
      totalPages = Math.max(1, Math.ceil(paragraphs.length / 5));
    } catch {}
  } else if (format === 'pdf') {
    textContent = 'Documento PDF com páginas reais, rolagem vertical contínua, camada de texto e zoom com preservação de foco.';
  }

  const book: Book = {
    id: bookId,
    title: overrides?.title || detectedTitle,
    author: overrides?.author || detectedAuthor,
    coverUrl: coverUrl || '',
    coverType,
    coverSource,
    coverStatus,
    coverGeneratedAt: new Date().toISOString(),
    description: overrides?.description || detectedDescription || 'Livro importado para a Biblioteca.',
    format,
    totalPages,
    totalChapters,
    fileBlobKey: bookId,
    originalFileName: fileName,
    originalFileSize: file.size,
    originalFileChecksum: checksum,
    importStatus: 'completed',
    textContent,
    status: 'not_started',
    isFavorite: false,
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await dbPut('books', book);
  if (existingBooksCache) {
    existingBooksCache.push(book);
  }
  return book;
}

export type ImportItemStatus = 'pending' | 'processing' | 'success' | 'error';

export interface BatchItemReport {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  status: ImportItemStatus;
  book?: Book;
  errorMessage?: string;
}

export interface MultiImportProgress {
  current: number;
  total: number;
  currentFileName: string;
  percent: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  reports: BatchItemReport[];
}

export async function importMultipleBooks(
  files: File[],
  onProgress?: (progress: MultiImportProgress) => void,
  shouldCancel?: () => boolean,
  onItemUpdate?: (report: BatchItemReport, allReports: BatchItemReport[]) => void
): Promise<{
  success: Book[];
  errors: { fileName: string; error: string; file: File }[];
  cancelled?: boolean;
  reports: BatchItemReport[];
}> {
  const success: Book[] = [];
  const errors: { fileName: string; error: string; file: File }[] = [];
  const total = files.length;

  // Initialize all reports as pending
  const reports: BatchItemReport[] = files.map((f, i) => ({
    id: `batch-item-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    file: f,
    fileName: f.name,
    fileSize: f.size,
    status: 'pending',
  }));

  // Shared books cache for fast deduplication check across the entire batch
  const existingBooksCache = await getBooks();

  const sendProgress = (currentIdx: number, currentFileName: string) => {
    const successCount = reports.filter((r) => r.status === 'success').length;
    const failedCount = reports.filter((r) => r.status === 'error').length;
    const pendingCount = reports.filter((r) => r.status === 'pending').length;
    const processed = successCount + failedCount;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

    if (onProgress) {
      onProgress({
        current: Math.min(currentIdx + 1, total),
        total,
        currentFileName,
        percent,
        successCount,
        failedCount,
        pendingCount,
        reports: [...reports],
      });
    }
  };

  sendProgress(0, files[0]?.name || '');

  for (let i = 0; i < total; i++) {
    const report = reports[i];

    if (shouldCancel && shouldCancel()) {
      return { success, errors, cancelled: true, reports };
    }

    report.status = 'processing';
    if (onItemUpdate) onItemUpdate(report, reports);
    sendProgress(i, report.fileName);

    try {
      const book = await importBookFromFile(report.file, undefined, existingBooksCache);
      report.status = 'success';
      report.book = book;
      success.push(book);
    } catch (err: any) {
      console.error(`Falha ao importar ${report.fileName}:`, err);
      let errMsg = err?.message || 'Erro ao processar arquivo';
      if (err?.name === 'QuotaExceededError' || errMsg.includes('quota')) {
        errMsg = 'Armazenamento local cheio. Libere espaço no navegador.';
      } else if (errMsg.includes('Password') || errMsg.includes('password')) {
        errMsg = 'Arquivo PDF protegido por senha.';
      } else if (errMsg.includes('corrupted') || errMsg.includes('Invalid PDF') || errMsg.includes('buffer')) {
        errMsg = 'Arquivo corrompido ou formato inválido.';
      }
      report.status = 'error';
      report.errorMessage = errMsg;
      errors.push({
        fileName: report.fileName,
        error: errMsg,
        file: report.file,
      });
    }

    if (onItemUpdate) onItemUpdate(report, reports);
    sendProgress(i, report.fileName);

    // Controlled yield between files so the browser UI thread can re-render
    // and garbage collector can release intermediate memory/buffers cleanly
    await new Promise((r) => setTimeout(r, 60));
  }

  sendProgress(total, 'Concluído');
  return { success, errors, cancelled: false, reports };
}

// Reading Lists
export async function getReadingLists(): Promise<ReadingList[]> {
  const lists = await dbGetAll('reading_lists');
  if (lists.length === 0) {
    const defaultList: ReadingList = {
      id: 'default-reading-list',
      name: 'Quero Ler',
      description: 'Minha lista de leitura prioritária',
      createdAt: new Date().toISOString(),
    };
    await dbPut('reading_lists', defaultList);
    return [defaultList];
  }
  return lists;
}

export async function getReadingListItems(listId: string): Promise<ReadingListItem[]> {
  const all = await dbGetAll('reading_list_items');
  return all.filter((i) => i.listId === listId).sort((a, b) => a.order - b.order);
}

export async function addBookToReadingList(listId: string, bookId: string, isPriority: boolean = false): Promise<void> {
  const existing = await getReadingListItems(listId);
  const alreadyThere = existing.find((i) => i.bookId === bookId);
  if (alreadyThere) return;

  const newItem: ReadingListItem = {
    id: `rli-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    listId,
    bookId,
    order: existing.length + 1,
    isPriority,
    addedAt: new Date().toISOString(),
  };
  await dbPut('reading_list_items', newItem);
}

export async function removeBookFromReadingList(itemId: string): Promise<void> {
  await dbDelete('reading_list_items', itemId);
}

export async function reorderReadingListItems(items: ReadingListItem[]): Promise<void> {
  for (let idx = 0; idx < items.length; idx++) {
    const updated = { ...items[idx], order: idx + 1 };
    await dbPut('reading_list_items', updated);
  }
}

export async function toggleReadingListItemPriority(itemId: string): Promise<void> {
  const item = await dbGet('reading_list_items', itemId);
  if (item) {
    item.isPriority = !item.isPriority;
    await dbPut('reading_list_items', item);
  }
}

// Reading Goals
export async function getReadingGoal(bookId: string): Promise<ReadingGoal | undefined> {
  const goals = await dbGetAll('reading_goals');
  return goals.find((g) => g.bookId === bookId);
}

export async function saveReadingGoal(
  bookId: string,
  targetDays: number,
  totalPages: number = 100
): Promise<ReadingGoal> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + targetDays);
  const dailyTargetPages = Math.max(1, Math.ceil(totalPages / targetDays));

  const goal: ReadingGoal = {
    id: `goal-${bookId}`,
    bookId,
    targetDays,
    targetDate: targetDate.toISOString().split('T')[0],
    dailyTargetPages,
    createdAt: new Date().toISOString(),
  };
  await dbPut('reading_goals', goal);
  return goal;
}
