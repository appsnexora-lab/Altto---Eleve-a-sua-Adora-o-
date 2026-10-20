/**
 * PdfDocument.ts
 * Handles PDF loading, validation, page retrieval, metadata extraction,
 * and page dimension caching to prevent layout shifts (CLS).
 */
import { initPdfWorker } from './PdfWorker';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface PdfMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  totalPages: number;
}

export interface PageDimension {
  pageNumber: number;
  width: number;
  height: number;
  aspectRatio: number; // width / height
}

export class PdfDocumentModel {
  private pdfDoc: PDFDocumentProxy | null = null;
  private pageCache: Map<number, PDFPageProxy> = new Map();
  private dimensionCache: Map<number, PageDimension> = new Map();
  private defaultAspectRatio: number = 0.707; // standard A4 aspect ratio fallback (1 / sqrt(2))
  private loadingTask: any = null;
  public totalPages: number = 0;
  public metadata: PdfMetadata | null = null;
  public isLoaded: boolean = false;

  /**
   * Load real PDF document from ArrayBuffer or Uint8Array.
   */
  async load(data: ArrayBuffer | Uint8Array, password?: string): Promise<PdfMetadata> {
    const lib = initPdfWorker();
    this.cleanup();

    if (!data) {
      throw new Error('PDF_DATA_EMPTY');
    }

    let byteLen = 0;
    try {
      byteLen = data instanceof Uint8Array ? data.byteLength : data.byteLength;
    } catch {
      byteLen = 0;
    }

    if (byteLen === 0) {
      throw new Error('PDF_BUFFER_DETACHED');
    }

    // Wrap in view without duplicating heap memory
    const safeBytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    this.loadingTask = lib.getDocument({
      data: safeBytes,
      password: password || undefined,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${lib.version || '4.10.38'}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${lib.version || '4.10.38'}/standard_fonts/`,
    });

    try {
      const doc = await this.loadingTask.promise;
      this.pdfDoc = doc;
      this.totalPages = doc.numPages;
      this.isLoaded = true;

      // Extract metadata
      let metaInfo: any = {};
      try {
        const rawMeta = await doc.getMetadata();
        metaInfo = rawMeta?.info || {};
      } catch (e) {
        console.warn('Metadata parsing skipped:', e);
      }

      this.metadata = {
        title: metaInfo.Title || '',
        author: metaInfo.Author || '',
        creator: metaInfo.Creator || '',
        producer: metaInfo.Producer || '',
        creationDate: metaInfo.CreationDate || '',
        totalPages: this.totalPages,
      };

      // Measure page 1 immediately to establish baseline dimensions
      if (this.totalPages > 0) {
        const p1 = await this.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        this.defaultAspectRatio = vp.width / vp.height;
        this.dimensionCache.set(1, {
          pageNumber: 1,
          width: vp.width,
          height: vp.height,
          aspectRatio: this.defaultAspectRatio,
        });
      }

      return this.metadata;
    } catch (err: any) {
      if (err?.name === 'PasswordException') {
        throw new Error('PDF_PASSWORD_REQUIRED');
      } else if (err?.name === 'InvalidPDFException') {
        throw new Error('PDF_CORRUPTED');
      }
      throw err;
    }
  }

  /**
   * Get cached or fetch real PDFPageProxy.
   */
  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    if (!this.pdfDoc) {
      throw new Error('PDF document not loaded');
    }
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Invalid page number: ${pageNumber}`);
    }
    if (this.pageCache.has(pageNumber)) {
      return this.pageCache.get(pageNumber)!;
    }

    const page = await this.pdfDoc.getPage(pageNumber);
    this.pageCache.set(pageNumber, page);

    // Cache dimension
    if (!this.dimensionCache.has(pageNumber)) {
      const vp = page.getViewport({ scale: 1 });
      this.dimensionCache.set(pageNumber, {
        pageNumber,
        width: vp.width,
        height: vp.height,
        aspectRatio: vp.width / vp.height,
      });
    }

    return page;
  }

  /**
   * Get estimated or exact dimension of any page.
   * If page hasn't been fetched yet, returns estimated dimension with baseline aspect ratio.
   * This guarantees instantaneous reserved space and eliminates layout shift (CLS).
   */
  getPageDimension(pageNumber: number): PageDimension {
    const cached = this.dimensionCache.get(pageNumber);
    if (cached) return cached;

    // Use default baseline aspect ratio
    return {
      pageNumber,
      width: 595, // standard A4 pt
      height: 595 / this.defaultAspectRatio,
      aspectRatio: this.defaultAspectRatio,
    };
  }

  /**
   * Renders a specific page (default page 1) to a high-quality Data URL.
   * Perfect for extracting real book covers / thumbnails from PDFs.
   */
  async renderPageToDataUrl(pageNumber: number = 1, targetWidth: number = 480): Promise<string> {
    if (typeof document === 'undefined') {
      throw new Error('Canvas rendering only available in browser environment');
    }
    const page = await this.getPage(pageNumber);
    const unscaledVp = page.getViewport({ scale: 1 });
    const scale = Math.max(0.2, targetWidth / (unscaledVp.width || 480));
    const vp = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Could not create canvas context');
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport: vp,
      canvas,
    } as any);

    await renderTask.promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    // Free canvas resources
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  }

  /**
   * Releases cached pages when memory pressure is high or when document closes.
   */
  cleanup(): void {
    for (const page of this.pageCache.values()) {
      try {
        page.cleanup();
      } catch {
        // ignore
      }
    }
    this.pageCache.clear();
    this.dimensionCache.clear();
    if (this.pdfDoc) {
      try {
        this.pdfDoc.cleanup();
        (this.pdfDoc as any).destroy?.();
      } catch {
        // ignore
      }
      this.pdfDoc = null;
    }
    if (this.loadingTask) {
      try {
        this.loadingTask.destroy?.();
      } catch {
        // ignore
      }
      this.loadingTask = null;
    }
    this.isLoaded = false;
    this.totalPages = 0;
    this.metadata = null;
  }
}
