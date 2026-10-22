/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TopBar, BottomNav, ActiveTab } from '@/components/Navbar';
import { HomeView } from '@/components/HomeView';
import { BibleView } from '@/components/BibleView';
import { DevotionalView } from '@/components/DevotionalView';
import { LibraryView } from '@/components/LibraryView';
import { ProfileView } from '@/components/ProfileView';
import { ReaderModal } from '@/components/ReaderModal';
import { getBibles, importOfficialAlmeidaBible, saveBibleReading } from '@/lib/bibleService';
import { getDevotionals, importOfficialDevotional, saveDevotionalReading } from '@/lib/devotionalService';
import { markBookAsCurrentlyReading } from '@/lib/bookService';
import { initUserProfile } from '@/lib/userService';
import { ContentType, DevotionalDay, Book } from '@/types';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { pullFromCloud } from '@/lib/firebaseSyncService';

interface ReaderState {
  isOpen: boolean;
  contentType: ContentType;
  contentId: string;
  title: string;
  subtitle?: string;
  bookName?: string;
  chapterNumber?: number;
  initialChapterOrDay?: number;
  targetChapterQuery?: string;
  targetBookName?: string;
  targetChapterNumber?: number;
  bibleBooks?: any[];
  devotionalDays?: DevotionalDay[];
  bookData?: Book;
  isReadAlready?: boolean;
  period?: 'morning' | 'afternoon' | 'night';
  isBible?: boolean;
  isDevotional?: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [readerState, setReaderState] = useState<ReaderState>({
    isOpen: false,
    contentType: 'bible',
    contentId: '',
    title: '',
  });

  // Offline detection & starter initialization
  useEffect(() => {
    const updateOnlineStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    async function initStarterData() {
      try {
        await initUserProfile();
        const bibles = await getBibles();
        if (bibles.length === 0) {
          await importOfficialAlmeidaBible();
        }
        const devs = await getDevotionals();
        if (devs.length === 0) {
          await importOfficialDevotional('365 Dias com Deus – Jornada Diária', 365);
        }
      } catch (err) {
        console.warn('Init error:', err);
      }
    }
    initStarterData();

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await pullFromCloud(user.uid);
      }
    });

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      unsubAuth();
    };
  }, []);

  const handleOpenReader = (params: any) => {
    // Check if this content is the selected Bible or selected Devotional
    const selectedBibleId = localStorage.getItem('altto_selected_bible_book_id');
    const selectedDevId = localStorage.getItem('altto_devotional_book_id');
    const isExcludedFromContinuarLendo =
      params.contentType === 'bible' ||
      params.contentType === 'devotional' ||
      Boolean(params.period) ||
      Boolean(params.isBible) ||
      Boolean(params.isDevotional) ||
      (selectedBibleId && (params.contentId === selectedBibleId || params.bookData?.id === selectedBibleId)) ||
      (selectedDevId && (params.contentId === selectedDevId || params.bookData?.id === selectedDevId)) ||
      (params.title && (params.title.toLowerCase().includes('bíblia') || params.title.toLowerCase().includes('biblia') || params.title.toLowerCase().includes('devocional'))) ||
      (params.bookData?.title && (params.bookData.title.toLowerCase().includes('bíblia') || params.bookData.title.toLowerCase().includes('biblia') || params.bookData.title.toLowerCase().includes('devocional')));

    if (params.contentType === 'book' && params.contentId && !isExcludedFromContinuarLendo) {
      try {
        localStorage.setItem('altto_last_read_book_id', params.contentId);
        window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId: params.contentId } }));
      } catch {}
      markBookAsCurrentlyReading(params.contentId).catch(() => {});
    }

    setReaderState({
      isOpen: true,
      contentType: params.contentType,
      contentId: params.contentId,
      title: params.title,
      subtitle: params.subtitle,
      bookName: params.bookName || 'Gênesis',
      chapterNumber: params.chapterNumber || params.initialChapterOrDay || 1,
      initialChapterOrDay: params.initialChapterOrDay || params.chapterNumber || 1,
      targetChapterQuery: params.targetChapterQuery,
      targetBookName: params.targetBookName || params.bookName,
      targetChapterNumber: params.targetChapterNumber || params.chapterNumber,
      bibleBooks: params.bibleBooks,
      devotionalDays: params.devotionalDays,
      bookData: params.bookData,
      isReadAlready: params.isReadAlready || false,
      period: params.period,
      isBible: Boolean(params.isBible || params.contentType === 'bible' || Boolean(params.period)),
      isDevotional: Boolean(params.isDevotional || params.contentType === 'devotional'),
    });
  };

  const handleMarkAsReadFromReader = async (details: {
    bookName?: string;
    chapterNumber?: number;
    dayNumber?: number;
  }) => {
    if (readerState.contentType === 'bible' || readerState.period) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      const hour = now.getHours();
      const fallbackPeriod = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';
      const actualPeriod = readerState.period || fallbackPeriod;

      await saveBibleReading({
        id: `reading-${selectedDateStr}-${actualPeriod}-${Date.now()}`,
        bibleId: readerState.contentId,
        bookName: details.bookName || readerState.bookName || 'Gênesis',
        chapterNumber: details.chapterNumber || readerState.chapterNumber || 1,
        period: actualPeriod,
        date: selectedDateStr,
        time: timeStr,
        userId: 'local-user',
        status: 'completed',
        completedAt: now.toISOString(),
      });

      // Synchronize period status in localStorage for automatic unlocking of next period
      try {
        const statusKey = `altto_bible_status_${selectedDateStr}`;
        const saved = localStorage.getItem(statusKey);
        let statusObj = { morning: false, afternoon: false, night: false };
        if (saved) {
          try {
            statusObj = JSON.parse(saved);
          } catch {}
        }
        statusObj[actualPeriod] = true;
        localStorage.setItem(statusKey, JSON.stringify(statusObj));
        window.dispatchEvent(new Event('altto_bible_status_updated'));
      } catch (err) {
        console.warn('Status sync error:', err);
      }
      setReaderState(prev => ({ ...prev, isReadAlready: true }));
    } else if (readerState.contentType === 'devotional') {
      const day = details.dayNumber || readerState.initialChapterOrDay || 1;
      await saveDevotionalReading({
        id: `dev-read-${readerState.contentId}-day-${day}`,
        devotionalId: readerState.contentId,
        dayNumber: day,
        date: selectedDateStr,
        status: 'completed',
        completedAt: new Date().toISOString(),
        userId: 'local-user',
      });
      setReaderState(prev => ({ ...prev, isReadAlready: true }));
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col bg-[#FFFFFF] text-[#292532] selection:bg-[#F5F0FF] selection:text-[#77619E] font-sans antialiased pb-20 md:pb-6">
      {/* Top Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab)}
        isOffline={isOffline}
      />

      {/* Main Views with Strict Domain Separation and Zero Horizontal Scroll */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden animate-in fade-in duration-200">
        {activeTab === 'home' && (
          <HomeView
            onNavigateTab={(tab) => {
              setActiveTab(tab);
            }}
            onOpenReader={handleOpenReader}
            selectedDateStr={selectedDateStr}
            onDateChange={setSelectedDateStr}
          />
        )}
        {activeTab === 'bible' && (
          <BibleView
            onOpenReader={handleOpenReader}
            selectedDateStr={selectedDateStr}
            onDateChange={setSelectedDateStr}
          />
        )}
        {activeTab === 'devotional' && (
          <DevotionalView
            onOpenReader={handleOpenReader}
            selectedDateStr={selectedDateStr}
            onDateChange={setSelectedDateStr}
          />
        )}
        {activeTab === 'library' && (
          <LibraryView onOpenReader={handleOpenReader} />
        )}
        {activeTab === 'profile' && <ProfileView />}
      </main>

      {/* Central Shared Professional Reader Modal */}
      {readerState.isOpen && (
        <ReaderModal
          contentType={readerState.contentType}
          contentId={readerState.contentId}
          title={readerState.title}
          subtitle={readerState.subtitle}
          initialChapterOrDay={readerState.initialChapterOrDay}
          initialBookName={readerState.bookName}
          targetChapterQuery={readerState.targetChapterQuery}
          targetBookName={readerState.targetBookName || readerState.bookName}
          targetChapterNumber={readerState.targetChapterNumber || readerState.chapterNumber}
          bibleBooks={readerState.bibleBooks}
          devotionalDays={readerState.devotionalDays}
          bookData={readerState.bookData}
          isBible={readerState.isBible}
          isDevotional={readerState.isDevotional}
          onClose={() => setReaderState(prev => ({ ...prev, isOpen: false }))}
          onMarkAsRead={handleMarkAsReadFromReader}
          isReadAlready={readerState.isReadAlready}
        />
      )}

      {/* Bottom Navigation for Mobile */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab)}
        isOffline={isOffline}
      />
    </div>
  );
}
