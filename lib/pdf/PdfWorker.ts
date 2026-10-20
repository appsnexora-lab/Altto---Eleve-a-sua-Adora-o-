/**
 * PdfWorker.ts
 * Manages the PDF.js library instance and sets up the Web Worker for background processing.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let isWorkerInitialized = false;

export function initPdfWorker(): typeof pdfjsLib {
  if (typeof window === 'undefined') {
    return pdfjsLib;
  }
  if (!isWorkerInitialized) {
    try {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      }
      isWorkerInitialized = true;
    } catch (e) {
      console.warn('PDF Worker initialization notice:', e);
    }
  }
  return pdfjsLib;
}

export { pdfjsLib };
