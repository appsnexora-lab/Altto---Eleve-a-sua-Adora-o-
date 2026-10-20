/**
 * coverService.ts
 * High-performance cover extraction, optimization, validation, and repair engine.
 * Handles PDF, EPUB, CBZ, and ensures original files are never mutated.
 */

import { Book, BookFormat } from '@/types';
import { dbGet, dbPut, dbGetAll, getBlob, getBlobAsArrayBuffer } from './indexedDB';
import { PdfDocumentModel } from './pdf/PdfDocument';
import { EpubBook } from './epub/EpubBook';
import JSZip from 'jszip';

export interface ExtractedCoverResult {
  coverUrl: string;
  coverType: string;
  coverSource: Book['coverSource'];
  title?: string;
  author?: string;
  description?: string;
  totalPages?: number;
  totalChapters?: number;
}

/**
 * Resizes any image data URL to a lightweight, sharp thumbnail (~480px width)
 * while strictly preserving the original aspect ratio (typically ~2:3 for book covers).
 */
export async function optimizeCoverThumbnail(
  dataUrl: string,
  maxWidth: number = 640,
  maxHeight: number = 960
): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        if (origWidth <= 0 || origHeight <= 0) {
          resolve(dataUrl);
          return;
        }

        // Calculate aspect-preserving thumbnail dimensions
        const ratio = Math.min(maxWidth / origWidth, maxHeight / origHeight, 1.0);
        const targetW = Math.max(160, Math.round(origWidth * ratio));
        const targetH = Math.max(240, Math.round(origHeight * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Clean neutral backing in case of transparency
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);

        // High quality bicubic downscaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // Export as JPEG with 0.90 quality for crisp book covers and typography
        const optimized = canvas.toDataURL('image/jpeg', 0.90);

        // Free canvas
        canvas.width = 0;
        canvas.height = 0;
        resolve(optimized);
      } catch (err) {
        console.warn('Falha ao otimizar miniatura:', err);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Checks if a canvas/image is mostly solid white/blank (> 99.2% white or uniform pixels).
 */
function isImageMostlyBlank(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.drawImage(img, 0, 0, 64, 64);
        const imgData = ctx.getImageData(0, 0, 64, 64);
        const d = imgData.data;
        let whitePixels = 0;
        const total = 64 * 64;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          if (r > 248 && g > 248 && b > 248) {
            whitePixels++;
          }
        }
        canvas.width = 0;
        canvas.height = 0;
        resolve(whitePixels / total > 0.992);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/**
 * Calculates SHA-256 checksum of an ArrayBuffer for duplicate prevention and file integrity.
 */
export async function calculateChecksum(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.slice(0, Math.min(buffer.byteLength, 1024 * 1024)));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }
  return `size-${buffer.byteLength}`;
}

export async function calculateFileChecksum(file: File | Blob): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const slice = file.slice(0, Math.min(file.size, 1024 * 1024));
      const buf = await slice.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return `${hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')}-${file.size}`;
    } catch {}
  }
  return `size-${file.size}`;
}

/**
 * Extracts cover, metadata, and structural info from a raw file buffer.
 */
export async function extractCoverFromBuffer(
  buffer: ArrayBuffer,
  format: BookFormat,
  fileName?: string
): Promise<ExtractedCoverResult> {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Buffer vazio');
  }

  // 1. PDF EXTRACTION
  if (format === 'pdf') {
    const pdfDoc = new PdfDocumentModel();
    try {
      const meta = await pdfDoc.load(buffer);
      let rawCover = await pdfDoc.renderPageToDataUrl(1, 640);

      // Check if page 1 is a blank white flyleaf and page 2 or 3 is the actual cover
      if (pdfDoc.totalPages > 1 && (await isImageMostlyBlank(rawCover))) {
        try {
          const page2Cover = await pdfDoc.renderPageToDataUrl(2, 640);
          if (!(await isImageMostlyBlank(page2Cover))) {
            rawCover = page2Cover;
          } else if (pdfDoc.totalPages > 2) {
            const page3Cover = await pdfDoc.renderPageToDataUrl(3, 640);
            if (!(await isImageMostlyBlank(page3Cover))) {
              rawCover = page3Cover;
            }
          }
        } catch {}
      }

      const optimized = await optimizeCoverThumbnail(rawCover, 640, 960);
      return {
        coverUrl: optimized,
        coverType: 'image/jpeg',
        coverSource: 'first-page',
        title: meta.title || undefined,
        author: meta.author || undefined,
        totalPages: meta.totalPages || 1,
      };
    } finally {
      pdfDoc.cleanup();
    }
  }

  // 2. EPUB EXTRACTION
  if (format === 'epub') {
    let epubBook: EpubBook | null = null;
    try {
      epubBook = await EpubBook.open(buffer);
      let coverDataUrl = await epubBook.getCoverDataUrl();
      let coverSource: Book['coverSource'] = 'manifest';

      if (epubBook.coverItem) {
        coverSource = (epubBook.metadata.coverSource as Book['coverSource']) || 'metadata';
      }

      let optimizedCover = '';
      if (coverDataUrl) {
        optimizedCover = await optimizeCoverThumbnail(coverDataUrl, 640, 960);
      }

      const result: ExtractedCoverResult = {
        coverUrl: optimizedCover,
        coverType: 'image/jpeg',
        coverSource,
        title: epubBook.metadata.title || undefined,
        author: epubBook.metadata.creator || undefined,
        description: epubBook.metadata.description || undefined,
        totalChapters: epubBook.spineItems.length || 1,
      };

      return result;
    } finally {
      if (epubBook) {
        epubBook.cleanup();
      }
    }
  }

  // 3. CBZ (Comic Book Zip) EXTRACTION
  if (format === 'cbz') {
    const zip = await JSZip.loadAsync(buffer.slice(0));
    const imageFiles = Object.keys(zip.files)
      .filter((fn) => /\.(jpe?g|png|webp|gif)$/i.test(fn) && !zip.files[fn].dir)
      .sort();

    if (imageFiles.length > 0) {
      const firstImg = imageFiles[0];
      const base64 = await zip.files[firstImg].async('base64');
      const ext = firstImg.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const rawDataUrl = `data:${mime};base64,${base64}`;
      const optimized = await optimizeCoverThumbnail(rawDataUrl, 480, 720);

      return {
        coverUrl: optimized,
        coverType: 'image/jpeg',
        coverSource: 'cbz-page',
        totalPages: imageFiles.length,
      };
    }
  }

  // Fallback for TXT or unsupported
  return {
    coverUrl: '',
    coverType: 'image/jpeg',
    coverSource: 'fallback',
    title: fileName ? fileName.replace(/\.[^/.]+$/, '') : undefined,
  };
}

/**
 * Repairs a single book by re-extracting its cover from the original stored binary.
 * Preserves reading progress, favorites, reading list, goals, notes and history!
 */
export async function repairBookCover(book: Book): Promise<{ success: boolean; book: Book; reason?: string }> {
  try {
    const blobKey = book.fileBlobKey || book.id;
    const arrayBuffer = await getBlobAsArrayBuffer(blobKey);

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return {
        success: false,
        book,
        reason: 'Arquivo original não encontrado no IndexedDB (blob ausente ou vazio).',
      };
    }

    const extraction = await extractCoverFromBuffer(arrayBuffer, book.format, book.originalFileName || book.title);

    if (extraction.coverUrl) {
      book.coverUrl = extraction.coverUrl;
      book.coverType = extraction.coverType || 'image/jpeg';
      book.coverSource = extraction.coverSource;
      book.coverStatus = 'repaired';
      book.coverGeneratedAt = new Date().toISOString();
      book.updatedAt = new Date().toISOString();

      if (!book.title || book.title === book.originalFileName) {
        if (extraction.title) book.title = extraction.title;
      }
      if (!book.author || book.author === 'Autor Desconhecido') {
        if (extraction.author) book.author = extraction.author;
      }

      await dbPut('books', book);
      return { success: true, book };
    } else {
      book.coverStatus = 'missing';
      await dbPut('books', book);
      return { success: false, book, reason: 'O arquivo não contém uma imagem de capa recuperável.' };
    }
  } catch (err: any) {
    return { success: false, book, reason: err?.message || 'Erro durante extração da capa.' };
  }
}

/**
 * Allows the user to select any page of a PDF document (e.g. Page 1, Page 2, Page 3)
 * to be saved as the official crisp 100% original cover.
 */
export async function setBookCoverFromPdfPage(
  book: Book,
  pageNumber: number
): Promise<{ success: boolean; book: Book; reason?: string }> {
  try {
    const blobKey = book.fileBlobKey || book.id;
    const arrayBuffer = await getBlobAsArrayBuffer(blobKey);
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return { success: false, book, reason: 'Arquivo original PDF não encontrado.' };
    }

    const pdfDoc = new PdfDocumentModel();
    try {
      await pdfDoc.load(arrayBuffer);
      const targetPage = Math.max(1, Math.min(pageNumber, pdfDoc.totalPages));
      const rawCover = await pdfDoc.renderPageToDataUrl(targetPage, 640);
      const optimized = await optimizeCoverThumbnail(rawCover, 640, 960);

      book.coverUrl = optimized;
      book.coverType = 'image/jpeg';
      book.coverSource = 'first-page';
      book.coverStatus = 'custom';
      book.coverGeneratedAt = new Date().toISOString();
      book.updatedAt = new Date().toISOString();

      await dbPut('books', book);
      return { success: true, book };
    } finally {
      pdfDoc.cleanup();
    }
  } catch (err: any) {
    return { success: false, book, reason: err?.message || 'Erro ao extrair página como capa.' };
  }
}

/**
 * Sets a custom high-resolution cover image uploaded by the user,
 * optimizing it while preserving full original fidelity and aspect ratio.
 */
export async function setBookCustomCover(
  book: Book,
  imageDataUrl: string
): Promise<{ success: boolean; book: Book }> {
  const optimized = await optimizeCoverThumbnail(imageDataUrl, 640, 960);
  book.coverUrl = optimized;
  book.coverType = 'image/jpeg';
  book.coverSource = 'manual';
  book.coverStatus = 'custom';
  book.coverGeneratedAt = new Date().toISOString();
  book.updatedAt = new Date().toISOString();

  await dbPut('books', book);
  return { success: true, book };
}

/**
 * Scans all books in the library and repairs books with missing, broken, or low-quality covers.
 */
export async function repairAllLibraryBooks(
  onProgress?: (progress: {
    current: number;
    total: number;
    currentTitle: string;
    repairedCount: number;
    failedCount: number;
  }) => void
): Promise<{ total: number; repaired: number; failed: number; skipped: number }> {
  const books = await dbGetAll('books');
  let repaired = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: books.length,
        currentTitle: book.title,
        repairedCount: repaired,
        failedCount: failed,
      });
    }

    // Only skip if already has a valid high quality data URL that wasn't flagged
    const hasValidCover =
      book.coverUrl &&
      book.coverUrl.startsWith('data:image/') &&
      book.coverUrl.length > 200 &&
      book.coverStatus !== 'missing' &&
      book.coverStatus !== 'error';

    if (hasValidCover && book.coverSource !== 'fallback') {
      skipped++;
      continue;
    }

    const res = await repairBookCover(book);
    if (res.success) {
      repaired++;
    } else {
      failed++;
    }

    // Short yield so UI doesn't stutter
    await new Promise((r) => setTimeout(r, 40));
  }

  return { total: books.length, repaired, failed, skipped };
}
