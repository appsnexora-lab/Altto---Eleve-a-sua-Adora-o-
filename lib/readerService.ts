import {
  ReadingProgress,
  Bookmark,
  Highlight,
  Annotation,
  ContentType,
  ReaderTheme
} from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete } from './indexedDB';

export async function getReadingProgress(contentId: string): Promise<ReadingProgress | undefined> {
  const all = await dbGetAll('reading_progress');
  return all.find(p => p.contentId === contentId);
}

export async function saveReadingProgress(
  contentId: string,
  contentType: ContentType,
  currentPage: number,
  percentage: number,
  scrollOffset?: number,
  zoomLevel?: number,
  currentChapter?: string | number
): Promise<void> {
  const progress: ReadingProgress = {
    id: `prog-${contentId}`,
    contentId,
    contentType,
    currentPage,
    percentage: Math.min(100, Math.max(0, percentage)),
    scrollOffset,
    zoomLevel,
    currentChapter,
    lastReadAt: new Date().toISOString(),
  };
  await dbPut('reading_progress', progress);
}

// Bookmarks
export async function getBookmarks(contentId?: string): Promise<Bookmark[]> {
  const all = await dbGetAll('bookmarks');
  if (contentId) {
    return all.filter(b => b.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addBookmark(
  contentId: string,
  contentType: ContentType,
  title: string,
  location: string,
  scrollOffset?: number
): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    title,
    location,
    scrollOffset,
    createdAt: new Date().toISOString(),
  };
  await dbPut('bookmarks', bookmark);
  return bookmark;
}

export async function deleteBookmark(id: string): Promise<void> {
  await dbDelete('bookmarks', id);
}

// Highlights
export async function getHighlights(contentId?: string): Promise<Highlight[]> {
  const all = await dbGetAll('highlights');
  if (contentId) {
    return all.filter(h => h.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addHighlight(
  contentId: string,
  contentType: ContentType,
  text: string,
  color: 'gold' | 'emerald' | 'sky' | 'rose',
  location: string,
  note?: string
): Promise<Highlight> {
  const highlight: Highlight = {
    id: `hl-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    text,
    color,
    location,
    note,
    createdAt: new Date().toISOString(),
  };
  await dbPut('highlights', highlight);
  return highlight;
}

export async function deleteHighlight(id: string): Promise<void> {
  await dbDelete('highlights', id);
}

// Annotations
export async function getAnnotations(contentId?: string): Promise<Annotation[]> {
  const all = await dbGetAll('annotations');
  if (contentId) {
    return all.filter(a => a.contentId === contentId);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addAnnotation(
  contentId: string,
  contentType: ContentType,
  text: string,
  location: string,
  title?: string
): Promise<Annotation> {
  const annotation: Annotation = {
    id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    userId: 'local-user',
    contentId,
    contentType,
    title,
    text,
    location,
    createdAt: new Date().toISOString(),
  };
  await dbPut('annotations', annotation);
  return annotation;
}

export async function deleteAnnotation(id: string): Promise<void> {
  await dbDelete('annotations', id);
}

// Reader Theme Palettes
export const THEME_STYLES: Record<
  ReaderTheme,
  {
    name: string;
    bg: string;
    text: string;
    cardBg: string;
    accent: string;
    border: string;
    badgeBg: string;
  }
> = {
  light: {
    name: 'Claro',
    bg: 'bg-white',
    text: 'text-slate-900',
    cardBg: 'bg-slate-50',
    accent: 'text-amber-700',
    border: 'border-slate-200',
    badgeBg: 'bg-slate-100',
  },
  cream: {
    name: 'Creme',
    bg: 'bg-[#FDFBF7]',
    text: 'text-[#2C2523]',
    cardBg: 'bg-[#F5F0E6]',
    accent: 'text-[#8C6D3B]',
    border: 'border-[#E6DFC8]',
    badgeBg: 'bg-[#EFE8D8]',
  },
  sepia: {
    name: 'Sépia',
    bg: 'bg-[#F4ECD8]',
    text: 'text-[#433422]',
    cardBg: 'bg-[#E8DCBF]',
    accent: 'text-[#7D5A2E]',
    border: 'border-[#D6C49F]',
    badgeBg: 'bg-[#DECEAC]',
  },
  gray: {
    name: 'Cinza',
    bg: 'bg-[#22272E]',
    text: 'text-[#ADBAC7]',
    cardBg: 'bg-[#2D333B]',
    accent: 'text-[#539BF5]',
    border: 'border-[#444C56]',
    badgeBg: 'bg-[#373E47]',
  },
  dark: {
    name: 'Escuro',
    bg: 'bg-[#0F172A]',
    text: 'text-slate-100',
    cardBg: 'bg-[#1E293B]',
    accent: 'text-amber-400',
    border: 'border-slate-800',
    badgeBg: 'bg-slate-800/80',
  },
  oled: {
    name: 'OLED',
    bg: 'bg-black',
    text: 'text-[#E0E0E0]',
    cardBg: 'bg-[#121212]',
    accent: 'text-amber-400',
    border: 'border-[#262626]',
    badgeBg: 'bg-[#1A1A1A]',
  },
};
