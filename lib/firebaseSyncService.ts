import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
  testConnection,
  signInWithPopup,
  signOut,
  googleProvider,
  User,
} from './firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getUserProfile, saveUserProfile, UserProfile } from './userService';
import { getBooks, updateBook } from './bookService';
import { Book } from '@/types';

// Run connection validation on module boot
if (typeof window !== 'undefined') {
  testConnection();
}

/**
 * Gets current authenticated user UID, or null
 */
export function getCurrentUserId(): string | null {
  return auth.currentUser?.uid || null;
}

/**
 * Performs Google Login via Popup
 */
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      // Sync local profile and remote profile
      await pullFromCloud(result.user.uid);
      await pushAllToCloud(result.user.uid);
      window.dispatchEvent(new Event('altto_profile_updated'));
      window.dispatchEvent(new Event('altto_cloud_sync_updated'));
      return result.user;
    }
    return null;
  } catch (err: any) {
    console.error('Erro no login Google Firebase:', err);
    throw err;
  }
}

/**
 * Signs out from Firebase
 */
export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
  window.dispatchEvent(new Event('altto_cloud_sync_updated'));
}

/**
 * Syncs user profile to Firestore (/users/{userId})
 */
export async function syncProfileToCloud(profile?: UserProfile): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const p = profile || getUserProfile();
  const path = `users/${uid}`;
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        userId: uid,
        name: p.name || 'Anderson',
        avatarUrl: p.avatarUrl || '',
        avatarPreset: p.avatarPreset || 'gold',
        favoriteVerse: p.favoriteVerse || '',
        bio: p.bio || '',
        dailyGoalChapters: p.dailyGoalChapters || 3,
        streakDays: p.streakDays || 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Syncs user settings to Firestore (/users/{userId}/settings/main)
 */
export async function syncSettingsToCloud(): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/settings/main`;
  try {
    const selectedBibleId = localStorage.getItem('altto_selected_bible_book_id') || '';
    const useAlmeida = localStorage.getItem('altto_use_official_almeida') === 'true';
    const devId = localStorage.getItem('altto_devotional_book_id') || '';
    const lastReadId = localStorage.getItem('altto_last_read_book_id') || '';

    await setDoc(
      doc(db, 'users', uid, 'settings', 'main'),
      {
        userId: uid,
        selectedBibleBookId: selectedBibleId,
        useOfficialAlmeida: useAlmeida,
        devotionalBookId: devId,
        lastReadBookId: lastReadId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Syncs daily Bible reading status to Firestore (/users/{userId}/bible_status/{date})
 */
export async function syncBibleStatusToCloud(date: string, status: { morning: boolean; afternoon: boolean; night: boolean }): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/bible_status/${date}`;
  try {
    const notesStr = localStorage.getItem(`altto_bible_notes_${date}`) || '';
    await setDoc(
      doc(db, 'users', uid, 'bible_status', date),
      {
        userId: uid,
        date,
        morning: Boolean(status.morning),
        afternoon: Boolean(status.afternoon),
        night: Boolean(status.night),
        notes: notesStr,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Syncs devotional completed dates to Firestore (/users/{userId}/devotional_status/main)
 */
export async function syncDevotionalStatusToCloud(completedDates: string[]): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/devotional_status/main`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'devotional_status', 'main'),
      {
        userId: uid,
        completedDates: JSON.stringify(completedDates),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Syncs a book's metadata to Firestore (/users/{userId}/books/{bookId})
 */
export async function syncBookMetadataToCloud(book: Book): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/books/${book.id}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'books', book.id),
      {
        id: book.id,
        userId: uid,
        title: book.title || 'Sem título',
        author: book.author || '',
        format: book.format || 'pdf',
        coverUrl: book.coverUrl || '',
        status: book.status || 'not_started',
        progressPercent: book.progressPercent || 0,
        isFavorite: Boolean(book.isFavorite),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a book from Firestore (/users/{userId}/books/{bookId})
 */
export async function deleteBookFromCloud(bookId: string): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/books/${bookId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'books', bookId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Syncs reading progress to Firestore (/users/{userId}/reading_progress/{contentId})
 */
export async function syncReadingProgressToCloud(contentId: string, percentage: number, currentChapterOrDay: number, scrollTop: number = 0, zoomLevel: number = 1): Promise<void> {
  const uid = getCurrentUserId();
  if (!uid) return;
  const path = `users/${uid}/reading_progress/${contentId}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'reading_progress', contentId),
      {
        id: contentId,
        userId: uid,
        contentId,
        percentage,
        currentChapterOrDay,
        scrollTop,
        zoomLevel,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Pushes all current local states to Firestore
 */
export async function pushAllToCloud(targetUid?: string): Promise<{ success: boolean; count: number }> {
  const uid = targetUid || getCurrentUserId();
  if (!uid) return { success: false, count: 0 };

  let count = 0;
  try {
    // 1. Profile
    await syncProfileToCloud();
    count++;

    // 2. Settings
    await syncSettingsToCloud();
    count++;

    // 3. Devotional
    const devStr = localStorage.getItem('altto_devotional_completed_dates');
    if (devStr) {
      try {
        await syncDevotionalStatusToCloud(JSON.parse(devStr));
        count++;
      } catch {}
    }

    // 4. Books metadata
    const books = await getBooks();
    for (const b of books) {
      await syncBookMetadataToCloud(b);
      count++;
    }

    return { success: true, count };
  } catch (err) {
    console.warn('Erro ao sincronizar dados com Firestore:', err);
    return { success: false, count };
  }
}

/**
 * Pulls remote data from Firestore and updates local state
 */
export async function pullFromCloud(targetUid?: string): Promise<{ success: boolean }> {
  const uid = targetUid || getCurrentUserId();
  if (!uid) return { success: false };

  try {
    // 1. Profile
    const profileSnap = await getDoc(doc(db, 'users', uid));
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      saveUserProfile({
        name: data.name,
        avatarUrl: data.avatarUrl,
        avatarPreset: data.avatarPreset,
        favoriteVerse: data.favoriteVerse,
        bio: data.bio,
      });
    }

    // 2. Settings
    const settingsSnap = await getDoc(doc(db, 'users', uid, 'settings', 'main'));
    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      if (s.selectedBibleBookId) {
        localStorage.setItem('altto_selected_bible_book_id', s.selectedBibleBookId);
      }
      if (s.useOfficialAlmeida !== undefined) {
        localStorage.setItem('altto_use_official_almeida', String(s.useOfficialAlmeida));
      }
      if (s.devotionalBookId) {
        localStorage.setItem('altto_devotional_book_id', s.devotionalBookId);
      }
      if (s.lastReadBookId) {
        localStorage.setItem('altto_last_read_book_id', s.lastReadBookId);
      }
      window.dispatchEvent(new CustomEvent('altto_bible_book_changed', { detail: { bookId: s.selectedBibleBookId, isAlmeida: s.useOfficialAlmeida } }));
      window.dispatchEvent(new CustomEvent('altto_devotional_book_changed', { detail: { bookId: s.devotionalBookId } }));
      window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId: s.lastReadBookId } }));
    }

    // 3. Devotional status
    const devSnap = await getDoc(doc(db, 'users', uid, 'devotional_status', 'main'));
    if (devSnap.exists()) {
      const d = devSnap.data();
      if (d.completedDates) {
        localStorage.setItem('altto_devotional_completed_dates', d.completedDates);
        window.dispatchEvent(new Event('altto_devotional_status_updated'));
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('Erro ao carregar dados do Firestore:', err);
    return { success: false };
  }
}

// Automatic reactive synchronization listeners
if (typeof window !== 'undefined') {
  window.addEventListener('altto_profile_updated', () => {
    syncProfileToCloud().catch(() => {});
  });
  window.addEventListener('altto_bible_book_changed', () => {
    syncSettingsToCloud().catch(() => {});
  });
  window.addEventListener('altto_devotional_book_changed', () => {
    syncSettingsToCloud().catch(() => {});
  });
  window.addEventListener('altto_last_read_book_updated', () => {
    syncSettingsToCloud().catch(() => {});
  });
  window.addEventListener('altto_devotional_status_updated', () => {
    const devStr = localStorage.getItem('altto_devotional_completed_dates');
    if (devStr) {
      try {
        syncDevotionalStatusToCloud(JSON.parse(devStr)).catch(() => {});
      } catch {}
    }
  });
}

