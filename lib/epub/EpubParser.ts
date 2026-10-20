/**
 * EpubParser.ts
 * Parses EPUB 2 and EPUB 3 containers, OPF packages, NCX/NAV tables of contents,
 * metadata, and spine collections.
 */
import JSZip from 'jszip';
import {
  EpubMetadata,
  EpubManifestItem,
  EpubSpineItem,
  EpubTocItem,
} from './EpubTypes';

export interface ParsedEpubPackage {
  opfPath: string;
  baseDir: string;
  metadata: EpubMetadata;
  manifest: Map<string, EpubManifestItem>;
  manifestByFullPath: Map<string, EpubManifestItem>;
  spineItems: EpubSpineItem[];
  tocItems: EpubTocItem[];
  coverItem?: EpubManifestItem;
}

export class EpubParser {
  private zip: JSZip;
  private domParser: DOMParser;

  constructor(zip: JSZip) {
    this.zip = zip;
    this.domParser = new DOMParser();
  }

  /**
   * Main entry point: parses the entire EPUB package.
   */
  public async parse(): Promise<ParsedEpubPackage> {
    // 1. Find OPF package document via META-INF/container.xml
    const opfPath = await this.locateOpfPath();
    const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // 2. Read and parse OPF XML
    const opfContent = await this.readZipFileText(opfPath);
    if (!opfContent) {
      throw new Error(`OPF package file not found in EPUB: ${opfPath}`);
    }

    const opfDoc = this.domParser.parseFromString(opfContent, 'application/xml');
    const parserError = opfDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`Invalid OPF XML format: ${parserError.textContent}`);
    }

    const packageEl = opfDoc.querySelector('package');
    const epubVersion = packageEl?.getAttribute('version') || '2.0';

    // 3. Extract Metadata
    const metadata = this.parseMetadata(opfDoc, epubVersion);

    // 4. Extract Manifest items
    const { manifest, manifestByFullPath } = this.parseManifest(opfDoc, baseDir);

    // 5. Extract Spine (ordered reading items)
    const spineItems = this.parseSpine(opfDoc, manifest);

    // 6. Find Cover Image
    const coverItem = await this.findCoverItem(opfDoc, metadata, manifest, baseDir, spineItems);
    if (coverItem) {
      metadata.coverHref = coverItem.fullPath;
    }

    // 7. Extract Table of Contents (EPUB 3 NAV or EPUB 2 NCX)
    const tocItems = await this.parseTableOfContents(opfDoc, manifest, baseDir, spineItems);

    return {
      opfPath,
      baseDir,
      metadata,
      manifest,
      manifestByFullPath,
      spineItems,
      tocItems,
      coverItem,
    };
  }

  /**
   * Reads META-INF/container.xml to locate the OPF rootfile path.
   */
  private async locateOpfPath(): Promise<string> {
    const containerXml = await this.readZipFileText('META-INF/container.xml');
    if (!containerXml) {
      // Fallback: look for any .opf file in the zip
      const anyOpf = Object.keys(this.zip.files).find((fn) => fn.toLowerCase().endsWith('.opf'));
      if (anyOpf) return anyOpf;
      throw new Error('EPUB inválido: arquivo META-INF/container.xml não encontrado.');
    }

    const doc = this.domParser.parseFromString(containerXml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');
    const fullPath = rootfile?.getAttribute('full-path');

    if (!fullPath) {
      const anyOpf = Object.keys(this.zip.files).find((fn) => fn.toLowerCase().endsWith('.opf'));
      if (anyOpf) return anyOpf;
      throw new Error('EPUB inválido: elemento rootfile não especifica full-path.');
    }

    return this.cleanPath(fullPath);
  }

  /**
   * Extracts metadata fields from OPF <metadata>.
   */
  private parseMetadata(opfDoc: Document, _epubVersion: string): EpubMetadata {
    const metadataEl = opfDoc.querySelector('metadata');

    const getFirstText = (...tags: string[]): string => {
      if (!metadataEl) return '';
      for (const tag of tags) {
        const el =
          metadataEl.querySelector(tag) ||
          Array.from(metadataEl.getElementsByTagName('*')).find(
            (e) => e.localName.toLowerCase() === tag.toLowerCase()
          );
        if (el && el.textContent) {
          const val = el.textContent.trim();
          if (val) return val;
        }
      }
      return '';
    };

    const title = getFirstText('dc\\:title', 'title') || 'Documento EPUB';
    const creator = getFirstText('dc\\:creator', 'creator') || 'Autor Desconhecido';
    const publisher = getFirstText('dc\\:publisher', 'publisher');
    const language = getFirstText('dc\\:language', 'language') || 'pt';
    const description = getFirstText('dc\\:description', 'description');
    const rights = getFirstText('dc\\:rights', 'rights');
    const publicationDate = getFirstText('dc\\:date', 'date');

    return {
      title,
      creator,
      publisher,
      language,
      description,
      rights,
      publicationDate,
      epubVersion: _epubVersion,
    };
  }

  /**
   * Parses the <manifest> element into maps of id and fullPath.
   */
  private parseManifest(
    opfDoc: Document,
    baseDir: string
  ): {
    manifest: Map<string, EpubManifestItem>;
    manifestByFullPath: Map<string, EpubManifestItem>;
  } {
    const manifest = new Map<string, EpubManifestItem>();
    const manifestByFullPath = new Map<string, EpubManifestItem>();
    const itemElements = Array.from(opfDoc.querySelectorAll('manifest > item'));

    for (const el of itemElements) {
      const id = el.getAttribute('id');
      const href = el.getAttribute('href');
      const mediaType = el.getAttribute('media-type') || 'application/octet-stream';
      const properties = el.getAttribute('properties') || undefined;

      if (id && href) {
        const fullPath = this.resolvePath(baseDir, href);
        const item: EpubManifestItem = {
          id,
          href,
          fullPath,
          mediaType,
          properties,
        };
        manifest.set(id, item);
        manifestByFullPath.set(fullPath, item);
      }
    }

    return { manifest, manifestByFullPath };
  }

  /**
   * Parses the <spine> element to obtain linear reading order.
   */
  private parseSpine(opfDoc: Document, manifest: Map<string, EpubManifestItem>): EpubSpineItem[] {
    const spineItems: EpubSpineItem[] = [];
    const itemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    let index = 0;

    for (const ref of itemrefs) {
      const idref = ref.getAttribute('idref');
      const linear = ref.getAttribute('linear') !== 'no';
      if (idref && manifest.has(idref)) {
        const item = manifest.get(idref)!;
        spineItems.push({
          id: `spine-${index}`,
          idref,
          href: item.href,
          fullPath: item.fullPath,
          index,
          linear,
        });
        index++;
      }
    }

    return spineItems;
  }

  /**
   * Detects the cover image item with strict priority.
   */
  private async findCoverItem(
    opfDoc: Document,
    metadata: EpubMetadata,
    manifest: Map<string, EpubManifestItem>,
    _baseDir: string,
    spineItems: EpubSpineItem[]
  ): Promise<EpubManifestItem | undefined> {
    // Priority 1: Metadata cover tag (<meta name="cover" content="..."/>)
    const metaCoverTags = Array.from(opfDoc.querySelectorAll('metadata > meta[name="cover"]'));
    for (const metaCover of metaCoverTags) {
      const coverRef = metaCover.getAttribute('content') || metaCover.getAttribute('value');
      if (coverRef) {
        if (manifest.has(coverRef)) {
          metadata.coverSource = 'metadata';
          return manifest.get(coverRef);
        }
        let decoded = coverRef;
        try {
          decoded = decodeURIComponent(coverRef);
        } catch {}
        for (const item of Array.from(manifest.values())) {
          if (
            item.id.toLowerCase() === coverRef.toLowerCase() ||
            item.href.toLowerCase() === coverRef.toLowerCase() ||
            item.href.toLowerCase() === decoded.toLowerCase() ||
            item.fullPath.toLowerCase().endsWith(coverRef.toLowerCase()) ||
            item.fullPath.toLowerCase().endsWith(decoded.toLowerCase())
          ) {
            metadata.coverSource = 'metadata';
            return item;
          }
        }
      }
    }

    // Priority 1.2: EPUB 3 <meta property="cover-image">
    const propMetaTags = Array.from(opfDoc.querySelectorAll('metadata > meta[property="cover-image"]'));
    for (const tag of propMetaTags) {
      const val = tag.textContent?.trim();
      if (val) {
        if (manifest.has(val)) {
          metadata.coverSource = 'metadata';
          return manifest.get(val);
        }
        const item = Array.from(manifest.values()).find(
          (m) => m.id.toLowerCase() === val.toLowerCase() || m.href.toLowerCase().endsWith(val.toLowerCase())
        );
        if (item) {
          metadata.coverSource = 'metadata';
          return item;
        }
      }
    }

    // Priority 2: EPUB 3 manifest item with properties="cover-image"
    for (const item of Array.from(manifest.values())) {
      if (item.properties && item.properties.split(/\s+/).includes('cover-image')) {
        metadata.coverSource = 'cover-item';
        return item;
      }
    }

    // Priority 2.5: OPF <guide> <reference type="cover" .../>
    const guideCoverRefs = Array.from(opfDoc.querySelectorAll('guide > reference[type="cover"], guide > reference[type="other.reader-start-page"]'));
    for (const ref of guideCoverRefs) {
      const href = ref.getAttribute('href');
      if (href) {
        const cleanHref = href.split('#')[0];
        // If href directly points to an image
        const imgItem = Array.from(manifest.values()).find(
          (m) => (m.href === cleanHref || m.fullPath.endsWith(cleanHref)) && m.mediaType.startsWith('image/')
        );
        if (imgItem) {
          metadata.coverSource = 'manifest';
          return imgItem;
        }
        // If href points to an html/xhtml cover page
        const htmlItem = Array.from(manifest.values()).find(
          (m) => m.href === cleanHref || m.fullPath.endsWith(cleanHref)
        );
        if (htmlItem) {
          try {
            const htmlContent = await this.readZipFileText(htmlItem.fullPath);
            if (htmlContent) {
              const doc = this.domParser.parseFromString(htmlContent, 'text/html');
              const img = doc.querySelector('img[src], image[*|href], image[href]');
              const src = img?.getAttribute('src') || img?.getAttribute('xlink:href') || img?.getAttribute('href');
              if (src) {
                const resolved = this.resolvePath(htmlItem.fullPath, src);
                const matched = Array.from(manifest.values()).find(
                  (m) => m.fullPath === resolved || m.href.endsWith(src)
                );
                if (matched) {
                  metadata.coverSource = 'manifest';
                  return matched;
                }
              }
            }
          } catch {}
        }
      }
    }

    // Priority 3: Manifest items with id/href containing cover / capa keywords (excluding icons/logos)
    const coverRegex = /(cover|capa|front|jacket|portada|couverture)/i;
    const iconRegex = /(icon|logo|bullet|ornament|sep|divider|colophon|nav|btn)/i;
    for (const item of Array.from(manifest.values())) {
      if (item.mediaType.startsWith('image/')) {
        const idLower = item.id.toLowerCase();
        const hrefLower = item.href.toLowerCase();
        if ((coverRegex.test(idLower) || coverRegex.test(hrefLower)) && !iconRegex.test(hrefLower)) {
          metadata.coverSource = 'manifest';
          return item;
        }
      }
    }

    // Priority 3.1: Check if the first spine item is a cover page or titlepage
    if (spineItems.length > 0) {
      const firstSpine = spineItems[0];
      const spineHrefLower = firstSpine.href.toLowerCase();
      if (
        spineHrefLower.includes('cover') ||
        spineHrefLower.includes('capa') ||
        spineHrefLower.includes('titlepage') ||
        spineHrefLower.includes('title_page')
      ) {
        try {
          const coverHtml = await this.readZipFileText(firstSpine.fullPath);
          if (coverHtml) {
            const doc = this.domParser.parseFromString(coverHtml, 'text/html');
            const imgEl = doc.querySelector('img[src]');
            if (imgEl) {
              const src = imgEl.getAttribute('src');
              if (src) {
                const imgPath = this.resolvePath(firstSpine.fullPath, src);
                const matched = Array.from(manifest.values()).find(
                  (m) => m.fullPath === imgPath || m.href.endsWith(src)
                );
                if (matched) {
                  metadata.coverSource = 'manifest';
                  return matched;
                }
              }
            }
            const svgImage = doc.querySelector('image[*|href], image[href]');
            if (svgImage) {
              const href =
                svgImage.getAttribute('xlink:href') ||
                svgImage.getAttribute('href') ||
                svgImage.getAttribute('src');
              if (href) {
                const imgPath = this.resolvePath(firstSpine.fullPath, href);
                const matched = Array.from(manifest.values()).find(
                  (m) => m.fullPath === imgPath || m.href.endsWith(href)
                );
                if (matched) {
                  metadata.coverSource = 'manifest';
                  return matched;
                }
              }
            }
          }
        } catch (e) {
          console.warn('Falha ao inspecionar primeira página de capa:', e);
        }
      }
    }

    // Priority 4: Smart fallback across all raster images (excluding small icons, logos, bullets)
    const allImages = Array.from(manifest.values()).filter((item) =>
      item.mediaType.startsWith('image/')
    );
    if (allImages.length > 0) {
      const nonIcons = allImages.filter(
        (img) => !iconRegex.test(img.id + ' ' + img.href)
      );
      const pool = nonIcons.length > 0 ? nonIcons : allImages;
      const rasterImages = pool.filter(
        (img) =>
          img.mediaType === 'image/jpeg' ||
          img.mediaType === 'image/jpg' ||
          img.mediaType === 'image/png' ||
          img.mediaType === 'image/webp'
      );
      const candidate = rasterImages[0] || pool[0];
      if (candidate) {
        metadata.coverSource = 'first-image';
        return candidate;
      }
    }

    // Fallback directly to zip files
    const zipImageKeys = Object.keys(this.zip.files).filter(
      (fn) => /\.(jpe?g|png|webp)$/i.test(fn) && !this.zip.files[fn].dir
    );
    if (zipImageKeys.length > 0) {
      const sorted = zipImageKeys.sort((a, b) => {
        const aHas = coverRegex.test(a) ? 2 : iconRegex.test(a) ? -1 : 0;
        const bHas = coverRegex.test(b) ? 2 : iconRegex.test(b) ? -1 : 0;
        return bHas - aHas;
      });
      const chosenPath = sorted[0];
      const ext = chosenPath.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const syntheticItem: EpubManifestItem = {
        id: 'fallback-cover',
        href: chosenPath,
        fullPath: chosenPath,
        mediaType: mime,
      };
      metadata.coverSource = 'first-image';
      return syntheticItem;
    }

    return undefined;
  }

  /**
   * Parses Table of Contents from either EPUB 3 Navigation Document or EPUB 2 NCX file.
   */
  private async parseTableOfContents(
    opfDoc: Document,
    manifest: Map<string, EpubManifestItem>,
    _baseDir: string,
    spineItems: EpubSpineItem[]
  ): Promise<EpubTocItem[]> {
    // 1. Try EPUB 3 Navigation Document (item with properties="nav")
    for (const item of Array.from(manifest.values())) {
      if (item.properties && item.properties.includes('nav')) {
        try {
          const navContent = await this.readZipFileText(item.fullPath);
          if (navContent) {
            const navDir = item.fullPath.includes('/')
              ? item.fullPath.substring(0, item.fullPath.lastIndexOf('/') + 1)
              : '';
            const toc = this.parseEpub3Nav(navContent, navDir, spineItems);
            if (toc.length > 0) return toc;
          }
        } catch (err) {
          console.warn('Erro ao processar NAV EPUB 3, tentando NCX:', err);
        }
      }
    }

    // 2. Try EPUB 2 NCX file
    const spineEl = opfDoc.querySelector('spine');
    const tocId = spineEl?.getAttribute('toc');
    let ncxItem: EpubManifestItem | undefined;

    if (tocId && manifest.has(tocId)) {
      ncxItem = manifest.get(tocId);
    } else {
      for (const item of Array.from(manifest.values())) {
        if (
          item.mediaType === 'application/x-dtbncx+xml' ||
          item.fullPath.toLowerCase().endsWith('.ncx')
        ) {
          ncxItem = item;
          break;
        }
      }
    }

    if (ncxItem) {
      try {
        const ncxContent = await this.readZipFileText(ncxItem.fullPath);
        if (ncxContent) {
          const ncxDir = ncxItem.fullPath.includes('/')
            ? ncxItem.fullPath.substring(0, ncxItem.fullPath.lastIndexOf('/') + 1)
            : '';
          const toc = this.parseEpub2Ncx(ncxContent, ncxDir, spineItems);
          if (toc.length > 0) return toc;
        }
      } catch (err) {
        console.warn('Erro ao processar NCX EPUB 2:', err);
      }
    }

    // 3. Fallback: generate TOC from Spine items
    return spineItems.map((item, idx) => ({
      id: `toc-auto-${idx}`,
      label: `Capítulo ${idx + 1}`,
      href: item.href,
      fullPath: item.fullPath,
      chapterIndex: idx,
      subitems: [],
      level: 1,
    }));
  }

  /**
   * Parses EPUB 3 Navigation Document (XHTML with <nav epub:type="toc">).
   */
  private parseEpub3Nav(navHtml: string, navDir: string, spineItems: EpubSpineItem[]): EpubTocItem[] {
    const doc = this.domParser.parseFromString(navHtml, 'text/html');

    let navEl =
      doc.querySelector('nav[*|type="toc"]') ||
      doc.querySelector('nav[type="toc"]') ||
      doc.querySelector('nav#toc') ||
      doc.querySelector('nav');

    if (!navEl) return [];
    const ol = navEl.querySelector('ol');
    if (!ol) return [];

    const parseList = (olElement: Element, level: number = 1): EpubTocItem[] => {
      const items: EpubTocItem[] = [];
      const liElements = Array.from(olElement.children).filter(
        (c) => c.tagName.toLowerCase() === 'li'
      );

      for (const li of liElements) {
        const a = li.querySelector('a, span');
        const text = a?.textContent?.trim() || 'Seção';
        const rawHref = a?.getAttribute('href') || '';
        const [filePath, anchor] = rawHref.split('#');
        const fullPath = filePath ? this.resolvePath(navDir, filePath) : '';

        const chapterIdx = spineItems.findIndex(
          (sp) => sp.fullPath === fullPath || sp.fullPath.endsWith(filePath)
        );

        let subitems: EpubTocItem[] = [];
        const childOl = li.querySelector('ol');
        if (childOl) {
          subitems = parseList(childOl, level + 1);
        }

        items.push({
          id: `nav-${Math.random().toString(36).substring(2, 8)}`,
          label: text,
          href: rawHref,
          fullPath: fullPath || (chapterIdx >= 0 ? spineItems[chapterIdx].fullPath : ''),
          anchor,
          chapterIndex: chapterIdx >= 0 ? chapterIdx : 0,
          subitems,
          level,
        });
      }
      return items;
    };

    return parseList(ol, 1);
  }

  /**
   * Parses EPUB 2 NCX XML (<navMap> with recursive <navPoint> elements).
   */
  private parseEpub2Ncx(ncxXml: string, ncxDir: string, spineItems: EpubSpineItem[]): EpubTocItem[] {
    const doc = this.domParser.parseFromString(ncxXml, 'application/xml');
    const navMap = doc.querySelector('navMap');
    if (!navMap) return [];

    const parseNavPoints = (parentElement: Element, level: number = 1): EpubTocItem[] => {
      const items: EpubTocItem[] = [];
      const navPoints = Array.from(parentElement.children).filter(
        (c) => c.localName.toLowerCase() === 'navpoint'
      );

      for (const np of navPoints) {
        const id = np.getAttribute('id') || `ncx-${Math.random().toString(36).substring(2, 7)}`;
        const textEl = np.querySelector('navLabel > text');
        const label = textEl?.textContent?.trim() || 'Capítulo';
        const contentEl = np.querySelector('content');
        const rawSrc = contentEl?.getAttribute('src') || '';
        const [filePath, anchor] = rawSrc.split('#');
        const fullPath = filePath ? this.resolvePath(ncxDir, filePath) : '';

        const chapterIdx = spineItems.findIndex(
          (sp) => sp.fullPath === fullPath || sp.fullPath.endsWith(filePath)
        );

        const subitems = parseNavPoints(np, level + 1);

        items.push({
          id,
          label,
          href: rawSrc,
          fullPath: fullPath || (chapterIdx >= 0 ? spineItems[chapterIdx].fullPath : ''),
          anchor,
          chapterIndex: chapterIdx >= 0 ? chapterIdx : 0,
          subitems,
          level,
        });
      }
      return items;
    };

    return parseNavPoints(navMap, 1);
  }

  // --- Path & ZIP Utilities ---
  public resolvePath(basePath: string, relativePath: string): string {
    if (!relativePath) return basePath;
    if (relativePath.startsWith('/')) return relativePath.substring(1);

    const cleanRelative = relativePath.split('#')[0].split('?')[0];
    const stack = basePath.split('/').filter(Boolean);

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

  private cleanPath(p: string): string {
    return p.replace(/^\/+/, '').trim();
  }

  private async readZipFileText(path: string): Promise<string | null> {
    const clean = this.cleanPath(path);
    let file = this.zip.files[clean];
    if (!file) {
      const matchKey = Object.keys(this.zip.files).find(
        (k) => k.toLowerCase() === clean.toLowerCase()
      );
      if (matchKey) file = this.zip.files[matchKey];
    }
    if (!file || file.dir) return null;
    return await file.async('text');
  }
}
