/**
 * EpubBook.ts
 * Manages the loaded EPUB book instance, resource resolution, and object URL lifecycle.
 */
import JSZip from 'jszip';
import {
  EpubMetadata,
  EpubManifestItem,
  EpubSpineItem,
  EpubTocItem,
} from './EpubTypes';
import { EpubParser, ParsedEpubPackage } from './EpubParser';

export class EpubBook {
  public zip: JSZip;
  public metadata: EpubMetadata;
  public manifest: Map<string, EpubManifestItem>;
  public manifestByFullPath: Map<string, EpubManifestItem>;
  public spineItems: EpubSpineItem[];
  public tocItems: EpubTocItem[];
  public baseDir: string;
  public opfPath: string;
  public coverItem?: EpubManifestItem;

  private objectUrls: Set<string> = new Set();
  private blobCache: Map<string, Blob> = new Map();
  private dataUrlCache: Map<string, string> = new Map();

  constructor(zip: JSZip, parsed: ParsedEpubPackage) {
    this.zip = zip;
    this.metadata = parsed.metadata;
    this.manifest = parsed.manifest;
    this.manifestByFullPath = parsed.manifestByFullPath;
    this.spineItems = parsed.spineItems;
    this.tocItems = parsed.tocItems;
    this.baseDir = parsed.baseDir;
    this.opfPath = parsed.opfPath;
    this.coverItem = parsed.coverItem;
  }

  /**
   * Static factory: opens and parses an EPUB file from an ArrayBuffer.
   */
  public static async open(buffer: ArrayBuffer): Promise<EpubBook> {
    if (!buffer || buffer.byteLength === 0) {
      throw new Error('EPUB inválido: buffer vazio ou não inicializado.');
    }
    const zip = await JSZip.loadAsync(buffer);
    const parser = new EpubParser(zip);
    const parsed = await parser.parse();
    const book = new EpubBook(zip, parsed);

    // Pre-extract cover data URL if available
    try {
      const coverUrl = await book.getCoverDataUrl();
      if (coverUrl) {
        book.metadata.coverDataUrl = coverUrl;
      }
    } catch (err) {
      console.warn('Não foi possível extrair capa do EPUB:', err);
    }

    return book;
  }

  /**
   * Resolves a relative path against a base file path.
   */
  public resolvePath(basePath: string, relativePath: string): string {
    if (!relativePath) return basePath;
    if (relativePath.startsWith('/')) return relativePath.substring(1);

    const cleanRelative = relativePath.split('#')[0].split('?')[0];
    const stack = basePath.split('/').filter(Boolean);

    // Remove filename from base path
    if (stack.length > 0 && !basePath.endsWith('/')) {
      stack.pop();
    }

    const parts = cleanRelative.split('/').filter(Boolean);
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join('/');
  }

  /**
   * Retrieves a file as a Blob with cached reuse.
   */
  public async getFileBlob(fullPath: string, mimeType?: string): Promise<Blob | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    if (this.blobCache.has(clean)) {
      return this.blobCache.get(clean)!;
    }

    let file = this.findZipFile(clean);
    if (!file || file.dir) return null;

    const detectedMime = mimeType || this.getMimeTypeForPath(clean);
    const arrayBuffer = await file.async('arraybuffer');
    const blob = new Blob([arrayBuffer], { type: detectedMime });
    this.blobCache.set(clean, blob);
    return blob;
  }

  /**
   * Retrieves a file as a Data URL (safe for SVG / images).
   */
  public async getFileDataUrl(fullPath: string): Promise<string | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    if (this.dataUrlCache.has(clean)) {
      return this.dataUrlCache.get(clean)!;
    }

    let file = this.findZipFile(clean);
    if (!file || file.dir) return null;

    const mime = this.getMimeTypeForPath(clean);
    const base64 = await file.async('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    this.dataUrlCache.set(clean, dataUrl);
    return dataUrl;
  }

  /**
   * Flexible zip file finder that handles URL-encoding, casing, and relative folder structures.
   */
  private findZipFile(path: string): JSZip.JSZipObject | null {
    if (!path) return null;
    const clean = path.replace(/^\/+/, '').trim();
    if (this.zip.files[clean]) return this.zip.files[clean];

    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {}
    if (this.zip.files[decoded]) return this.zip.files[decoded];

    const cleanLower = clean.toLowerCase();
    const decodedLower = decoded.toLowerCase();
    const match = Object.keys(this.zip.files).find((k) => {
      const kLower = k.toLowerCase();
      return kLower === cleanLower || kLower === decodedLower;
    });
    if (match) return this.zip.files[match];

    // Try matching by filename ending
    const baseName = decoded.split('/').pop()?.toLowerCase();
    if (baseName) {
      const endMatch = Object.keys(this.zip.files).find((k) => {
        const kLower = k.toLowerCase().replace(/\\/g, '/');
        return kLower.endsWith('/' + baseName) || kLower === baseName;
      });
      if (endMatch) return this.zip.files[endMatch];
    }

    return null;
  }

  /**
   * Retrieves a file as raw text.
   */
  public async getFileText(fullPath: string): Promise<string | null> {
    const clean = fullPath.replace(/^\/+/, '').trim();
    let file = this.findZipFile(clean);
    if (!file || file.dir) return null;
    return await file.async('text');
  }

  /**
   * Extracts cover as Blob.
   */
  public async getCoverBlob(): Promise<Blob | null> {
    if (this.coverItem) {
      return await this.getFileBlob(this.coverItem.fullPath, this.coverItem.mediaType);
    }
    return null;
  }

  /**
   * Extracts cover as Data URL with smart ranking.
   */
  public async getCoverDataUrl(): Promise<string | null> {
    if (this.coverItem) {
      const dataUrl = await this.getFileDataUrl(this.coverItem.fullPath);
      if (dataUrl) return dataUrl;
    }

    // Secondary search: items marked as cover in manifest
    const manifestItems = Array.from(this.manifest.values()).filter((item) =>
      item.mediaType.startsWith('image/')
    );

    // Prioritize candidates with cover keywords
    const coverCandidates = manifestItems.filter((item) =>
      /(cover|capa|front|jacket|portada|couverture)/i.test(item.id + ' ' + item.href)
    );
    for (const item of coverCandidates) {
      const dataUrl = await this.getFileDataUrl(item.fullPath);
      if (dataUrl) return dataUrl;
    }

    // Filter out icons, logos, bullets and small decorative images
    const nonIconImages = manifestItems.filter((item) =>
      !/(icon|logo|bullet|ornament|sep|divider|colophon|nav|btn)/i.test(item.id + ' ' + item.href)
    );
    for (const item of nonIconImages) {
      const dataUrl = await this.getFileDataUrl(item.fullPath);
      if (dataUrl) return dataUrl;
    }

    // Inspect first 2 spine items for embedded cover images (common in Calibre / InDesign EPUBs)
    for (let sIdx = 0; sIdx < Math.min(2, this.spineItems.length); sIdx++) {
      const spine = this.spineItems[sIdx];
      try {
        const text = await this.getFileText(spine.fullPath);
        if (text) {
          const match =
            text.match(/<img[^>]+src=["']([^"']+)["']/i) ||
            text.match(/<image[^>]+(?:xlink:href|href)=["']([^"']+)["']/i);
          if (match && match[1]) {
            const resolved = this.resolvePath(spine.fullPath, match[1]);
            const dataUrl = await this.getFileDataUrl(resolved);
            if (dataUrl) return dataUrl;
          }
        }
      } catch {}
    }

    // Fallback directly to zip files
    const zipImages = Object.keys(this.zip.files).filter(
      (fn) => /\.(jpe?g|png|webp)$/i.test(fn) && !this.zip.files[fn].dir
    );
    const sortedZipImages = zipImages.sort((a, b) => {
      const aScore = /(cover|capa|front|jacket)/i.test(a) ? 2 : /(icon|logo|bullet)/i.test(a) ? -1 : 0;
      const bScore = /(cover|capa|front|jacket)/i.test(b) ? 2 : /(icon|logo|bullet)/i.test(b) ? -1 : 0;
      return bScore - aScore;
    });

    for (const fn of sortedZipImages) {
      const dataUrl = await this.getFileDataUrl(fn);
      if (dataUrl) return dataUrl;
    }

    return null;
  }

  /**
   * Maps file extensions to MIME types.
   */
  private getMimeTypeForPath(p: string): string {
    const ext = p.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'xhtml':
      case 'html':
      case 'htm':
        return 'application/xhtml+xml';
      case 'css':
        return 'text/css';
      case 'ncx':
        return 'application/x-dtbncx+xml';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Revokes all generated URLs and releases cache memory.
   */
  public cleanup(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.blobCache.clear();
    this.dataUrlCache.clear();
  }
}
