import { Bible, BibleBook, BibleReading, BibleReflection, PeriodType } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete } from './indexedDB';
import { BIBLE_BOOKS_CATALOG } from './bibleData';

export async function getBibles(): Promise<Bible[]> {
  return await dbGetAll('bibles');
}

export async function getBibleById(id: string): Promise<Bible | undefined> {
  return await dbGet('bibles', id);
}

export async function updateBible(bible: Bible): Promise<void> {
  await dbPut('bibles', bible);
}

export async function deleteBible(id: string): Promise<void> {
  await dbDelete('bibles', id);
}

export async function importOfficialAlmeidaBible(): Promise<Bible> {
  const books: BibleBook[] = BIBLE_BOOKS_CATALOG.map(b => ({
    id: b.id,
    name: b.name,
    testament: b.testament,
    chaptersCount: b.chaptersCount,
  }));

  const bible: Bible = {
    id: 'bible-almeida-arc',
    name: 'Bíblia Sagrada – Almeida',
    version: 'ARC (Almeida Revista e Corrigida)',
    authorOrEditor: 'João Ferreira de Almeida / Sociedade Bíblica',
    coverUrl: '',
    books,
    importedAt: new Date().toISOString(),
    totalChaptersRead: 0,
  };
  await dbPut('bibles', bible);
  return bible;
}

export async function importBibleFromFile(
  file: File,
  overrides?: { name?: string; version?: string; author?: string; coverUrl?: string }
): Promise<Bible> {
  const fileText = await file.text().catch(() => '');
  let detectedName = file.name.replace(/\.[^/.]+$/, '');
  let detectedVersion = 'Personalizada';
  let detectedAuthor = 'Importação do Usuário';

  if (file.name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(fileText);
      if (parsed.name) detectedName = parsed.name;
      if (parsed.version) detectedVersion = parsed.version;
      if (parsed.author) detectedAuthor = parsed.author;
    } catch {
      // ignore
    }
  }

  const books: BibleBook[] = BIBLE_BOOKS_CATALOG.map(b => ({
    id: b.id,
    name: b.name,
    testament: b.testament,
    chaptersCount: b.chaptersCount,
  }));

  const bible: Bible = {
    id: `bible-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: overrides?.name || detectedName,
    version: overrides?.version || detectedVersion,
    authorOrEditor: overrides?.author || detectedAuthor,
    coverUrl: overrides?.coverUrl || '',
    books,
    importedAt: new Date().toISOString(),
    totalChaptersRead: 0,
  };

  await dbPut('bibles', bible);
  return bible;
}

// Daily reading control
export async function getBibleReadingsByDate(dateStr: string): Promise<BibleReading[]> {
  const all = await dbGetAll('bible_readings');
  return all.filter(r => r.date === dateStr);
}

export async function getAllBibleReadings(): Promise<BibleReading[]> {
  return await dbGetAll('bible_readings');
}

export async function saveBibleReading(reading: BibleReading): Promise<void> {
  await dbPut('bible_readings', reading);
}

// Spiritual reflections ("O que Deus falou ao meu coração")
export async function saveBibleReflection(reflection: BibleReflection): Promise<void> {
  await dbPut('bible_reflections', reflection);
}

export async function getBibleReflectionsByDate(dateStr: string): Promise<BibleReflection[]> {
  const all = await dbGetAll('bible_reflections');
  return all.filter(r => r.date === dateStr);
}

export async function getAllBibleReflections(): Promise<BibleReflection[]> {
  const all = await dbGetAll('bible_reflections');
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Sequence logic: Check if yesterday had pending readings
export async function checkYesterdayPendingBibleReading(currentDateStr: string): Promise<BibleReading | null> {
  const today = new Date(currentDateStr + 'T00:00:00');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const yesterdayReadings = await getBibleReadingsByDate(yesterdayStr);
  const pendingReading = yesterdayReadings.find(r => r.status === 'pending');
  if (pendingReading) return pendingReading;

  const nightReading = yesterdayReadings.find(r => r.period === 'night');
  if (yesterdayReadings.length > 0 && (!nightReading || nightReading.status === 'pending')) {
    if (!nightReading) {
      return {
        id: `pending-synth-${yesterdayStr}-night`,
        bibleId: yesterdayReadings[0].bibleId,
        bookName: yesterdayReadings[0].bookName,
        chapterNumber: yesterdayReadings[0].chapterNumber,
        period: 'night',
        date: yesterdayStr,
        time: '21:00',
        userId: 'local-user',
        status: 'pending',
      };
    }
    return nightReading;
  }
  return null;
}
