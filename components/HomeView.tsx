'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  BookMarked,
  Library,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Search,
  Check,
  Sun,
  Sunset,
  Moon,
  Clock,
  Sparkles,
  Bookmark,
  Plus,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Compass,
} from 'lucide-react';
import { Book, Bible } from '@/types';
import { getBooks } from '@/lib/bookService';
import { getReadingProgress } from '@/lib/readerService';
import {
  getBibleBookAndChapter,
  formatChapterRange,
  getChaptersForDate,
} from '@/lib/bibleData';
import { getBibles } from '@/lib/bibleService';
import { getUserProfile, DEFAULT_USER_PROFILE, UserProfile } from '@/lib/userService';
import { ActiveTab } from './Navbar';

interface HomeViewProps {
  onNavigateTab: (tab: ActiveTab, params?: any) => void;
  onOpenReader: (params: any) => void;
  selectedDateStr?: string;
  onDateChange?: (date: string) => void;
}

interface BiblePlanConfig {
  morningCount: number;
  afternoonCount: number;
  nightCount: number;
}

interface PeriodStatus {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

type TimelineFilter = 'all' | 'bible' | 'devotional' | 'book';

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigateTab,
  onOpenReader,
  selectedDateStr,
  onDateChange,
}) => {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const activeDate = selectedDateStr || todayStr;

  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [inProgressBooks, setInProgressBooks] = useState<Book[]>([]);
  const [featuredBook, setFeaturedBook] = useState<Book | null>(null);
  const [featuredProgress, setFeaturedProgress] = useState<number>(0);

  // Search Modal
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string>('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Timeline filter tab
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');

  // Devotional Book state
  const [devotionalBook, setDevotionalBook] = useState<Book | null>(null);
  const [isDevReadToday, setIsDevReadToday] = useState<boolean>(false);

  // Bible state from library & plan
  const [bibleBook, setBibleBook] = useState<Book | null>(null);
  const [officialBible, setOfficialBible] = useState<Bible | null>(null);
  const [useOfficialAlmeida, setUseOfficialAlmeida] = useState<boolean>(false);

  const [planConfig, setPlanConfig] = useState<BiblePlanConfig>({
    morningCount: 1,
    afternoonCount: 1,
    nightCount: 1,
  });

  const [planStartDate, setPlanStartDate] = useState<string>(todayStr);
  const [planStartChapter, setPlanStartChapter] = useState<number>(1);

  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>({
    morning: false,
    afternoon: false,
    night: false,
  });

  // Profile and period status synchronization
  useEffect(() => {
    const handleProfileSync = () => {
      setUserProfile(getUserProfile());
    };

    const handleBibleStatusSync = () => {
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      }
    };

    const handleDevotionalSync = () => {
      const completedDatesStr = localStorage.getItem('altto_devotional_completed_dates');
      if (completedDatesStr) {
        try {
          const arr: string[] = JSON.parse(completedDatesStr);
          setIsDevReadToday(arr.includes(activeDate));
        } catch {}
      } else {
        setIsDevReadToday(false);
      }
    };

    window.addEventListener('altto_profile_updated', handleProfileSync);
    window.addEventListener('altto_bible_status_updated', handleBibleStatusSync);
    window.addEventListener('altto_devotional_status_updated', handleDevotionalSync);

    return () => {
      window.removeEventListener('altto_profile_updated', handleProfileSync);
      window.removeEventListener('altto_bible_status_updated', handleBibleStatusSync);
      window.removeEventListener('altto_devotional_status_updated', handleDevotionalSync);
    };
  }, [activeDate]);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      const booksList = await getBooks();
      if (isCancelled) return;
      setAllBooks(booksList);

      // 1. Devotional book from library
      const savedDevId = localStorage.getItem('altto_devotional_book_id');
      let devTarget: Book | null = null;
      if (savedDevId) {
        devTarget = booksList.find(b => b.id === savedDevId) || null;
      }
      if (!devTarget && booksList.length > 0) {
        const candidate = booksList.find(
          b =>
            b.title.toLowerCase().includes('devocional') ||
            b.title.toLowerCase().includes('cristo') ||
            b.title.toLowerCase().includes('deus')
        );
        devTarget = candidate || null;
      }
      setDevotionalBook(devTarget);

      const completedDatesStr = localStorage.getItem('altto_devotional_completed_dates');
      if (completedDatesStr) {
        try {
          const arr: string[] = JSON.parse(completedDatesStr);
          if (!isCancelled) setIsDevReadToday(arr.includes(activeDate));
        } catch {}
      } else {
        if (!isCancelled) setIsDevReadToday(false);
      }

      // 2. Bible book from library
      const bibles = await getBibles();
      if (!isCancelled && bibles.length > 0) {
        setOfficialBible(bibles[0]);
      }
      const isAlmeida = localStorage.getItem('altto_use_official_almeida') === 'true';
      const savedBibleBookId = localStorage.getItem('altto_selected_bible_book_id');
      let currentBibleBook: Book | null = null;

      if (isAlmeida) {
        setUseOfficialAlmeida(true);
      } else if (savedBibleBookId) {
        const found = booksList.find(b => b.id === savedBibleBookId);
        if (found) {
          currentBibleBook = found;
          setBibleBook(found);
          setUseOfficialAlmeida(false);
        } else {
          setUseOfficialAlmeida(true);
        }
      } else if (booksList.length > 0) {
        const candidate = booksList.find(
          b => b.title.toLowerCase().includes('bíblia') || b.title.toLowerCase().includes('biblia')
        );
        if (candidate) {
          currentBibleBook = candidate;
          setBibleBook(candidate);
          setUseOfficialAlmeida(false);
        } else {
          setUseOfficialAlmeida(true);
        }
      } else {
        setUseOfficialAlmeida(true);
      }

      // 3. Exclude selected Bible and Devotional books from "Continuar Lendo"
      const excludedIds = new Set<string>();
      if (savedBibleBookId) excludedIds.add(savedBibleBookId);
      if (currentBibleBook?.id) excludedIds.add(currentBibleBook.id);
      if (savedDevId) excludedIds.add(savedDevId);
      if (devTarget?.id) excludedIds.add(devTarget.id);

      const regularBooks = booksList.filter(b => !excludedIds.has(b.id));

      const inProg = regularBooks.filter(
        b => b.status === 'in_progress' || (b.progressPercent || 0) > 0
      );
      setInProgressBooks(inProg);

      // Prioritize explicitly last read book (stored in localStorage or most recent lastReadAt)
      let lastReadId = localStorage.getItem('altto_last_read_book_id');
      if (lastReadId && excludedIds.has(lastReadId)) {
        localStorage.removeItem('altto_last_read_book_id');
        lastReadId = null;
      }

      let topBook: Book | null = null;
      if (lastReadId) {
        topBook = regularBooks.find(b => b.id === lastReadId) || null;
      }
      if (!topBook) {
        const sorted = [...regularBooks].sort((a, b) => {
          const timeA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
          const timeB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
          return timeB - timeA;
        });
        const inProgSorted = sorted.filter(
          b => b.status === 'in_progress' || (b.progressPercent || 0) > 0
        );
        topBook = inProgSorted.length > 0 ? inProgSorted[0] : sorted.length > 0 ? sorted[0] : null;
      }
      setFeaturedBook(topBook);

      if (topBook) {
        const prog = await getReadingProgress(topBook.id);
        if (!isCancelled) {
          setFeaturedProgress(prog ? prog.percentage : topBook.progressPercent || 0);
        }
      } else {
        setFeaturedProgress(0);
      }

      // 4. Bible plan config
      const savedPlan = localStorage.getItem('altto_bible_plan_config');
      if (savedPlan) {
        try {
          setPlanConfig(JSON.parse(savedPlan));
        } catch {}
      }

      // 5. Plan start date & start chapter
      const savedStartDate = localStorage.getItem('altto_bible_plan_start_date');
      if (savedStartDate) {
        setPlanStartDate(savedStartDate);
      } else {
        localStorage.setItem('altto_bible_plan_start_date', todayStr);
        setPlanStartDate(todayStr);
      }

      const savedStartChapter = localStorage.getItem('altto_bible_plan_start_chapter');
      if (savedStartChapter) {
        const ch = parseInt(savedStartChapter, 10);
        if (!isNaN(ch) && ch >= 1 && ch <= 1189) {
          setPlanStartChapter(ch);
        }
      }

      // 6. Period status for active date
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      } else {
        setPeriodStatus({ morning: false, afternoon: false, night: false });
      }
    }

    const handleLastReadBookSync = async (e?: Event) => {
      const customEvt = e as CustomEvent<{ bookId: string; percentage?: number }>;
      const targetId = customEvt?.detail?.bookId || localStorage.getItem('altto_last_read_book_id');
      if (isCancelled) return;
      const freshBooks = await getBooks();
      if (isCancelled) return;
      setAllBooks(freshBooks);

      const curBibleId = localStorage.getItem('altto_selected_bible_book_id');
      const curDevId = localStorage.getItem('altto_devotional_book_id');
      const excludedIds = new Set<string>();
      if (curBibleId) excludedIds.add(curBibleId);
      if (curDevId) excludedIds.add(curDevId);
      if (devotionalBook?.id) excludedIds.add(devotionalBook.id);
      if (bibleBook?.id) excludedIds.add(bibleBook.id);

      const regularBooks = freshBooks.filter(b => !excludedIds.has(b.id));
      const inProg = regularBooks.filter(
        b => b.status === 'in_progress' || (b.progressPercent || 0) > 0
      );
      setInProgressBooks(inProg);

      let found: Book | null = null;
      if (targetId && !excludedIds.has(targetId)) {
        found = regularBooks.find(b => b.id === targetId) || null;
      }
      if (!found) {
        const sorted = [...regularBooks].sort((a, b) => {
          const timeA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
          const timeB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
          return timeB - timeA;
        });
        found = inProg.length > 0 ? inProg[0] : sorted.length > 0 ? sorted[0] : null;
      }

      if (found) {
        setFeaturedBook(found);
        const prog = await getReadingProgress(found.id);
        if (!isCancelled) {
          const pct = customEvt?.detail?.percentage !== undefined && targetId === found.id
            ? customEvt.detail.percentage
            : prog ? prog.percentage : found.progressPercent || 0;
          setFeaturedProgress(pct);
        }
      } else {
        setFeaturedBook(null);
        setFeaturedProgress(0);
      }
    };

    window.addEventListener('altto_last_read_book_updated', handleLastReadBookSync);
    window.addEventListener('focus', handleLastReadBookSync);
    loadData();
    setUserProfile(getUserProfile());

    return () => {
      isCancelled = true;
      window.removeEventListener('altto_last_read_book_updated', handleLastReadBookSync);
      window.removeEventListener('focus', handleLastReadBookSync);
    };
  }, [activeDate, todayStr]);

  // Daily Chapters calculation
  const { morningStart, afternoonStart, nightStart } = getChaptersForDate({
    activeDate,
    planStartDate,
    planStartChapter,
    morningCount: planConfig.morningCount,
    afternoonCount: planConfig.afternoonCount,
    nightCount: planConfig.nightCount,
  });

  const morningChapters = formatChapterRange(morningStart, planConfig.morningCount);
  const afternoonChapters = formatChapterRange(afternoonStart, planConfig.afternoonCount);
  const nightChapters = formatChapterRange(nightStart, planConfig.nightCount);

  // Current time-based active period
  const currentHour = new Date().getHours();
  const currentPeriod = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'night';

  // Toggle Bible Period status
  const handleToggleBiblePeriod = (period: 'morning' | 'afternoon' | 'night', e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newStatus = {
      ...periodStatus,
      [period]: !periodStatus[period],
    };
    setPeriodStatus(newStatus);
    try {
      localStorage.setItem(`altto_bible_status_${activeDate}`, JSON.stringify(newStatus));
      window.dispatchEvent(new Event('altto_bible_status_updated'));
      const periodLabel = period === 'morning' ? 'Manhã' : period === 'afternoon' ? 'Tarde' : 'Noite';
      showToast(
        !periodStatus[period]
          ? `✓ Leitura da ${periodLabel} concluída!`
          : `Leitura da ${periodLabel} desmarcada.`
      );
    } catch (err) {
      console.warn('Failed to save bible status:', err);
    }
  };

  // Toggle Devotional status
  const handleToggleDevotional = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const completedDatesStr = localStorage.getItem('altto_devotional_completed_dates');
    let arr: string[] = [];
    if (completedDatesStr) {
      try {
        arr = JSON.parse(completedDatesStr);
      } catch {}
    }
    const isCompleted = arr.includes(activeDate);
    const updated = isCompleted ? arr.filter(d => d !== activeDate) : [...arr, activeDate];
    try {
      localStorage.setItem('altto_devotional_completed_dates', JSON.stringify(updated));
      setIsDevReadToday(!isCompleted);
      window.dispatchEvent(new Event('altto_devotional_status_updated'));
      showToast(!isCompleted ? '✓ Devocional de hoje concluído!' : 'Devocional de hoje desmarcado.');
    } catch (err) {
      console.warn('Failed to save devotional status:', err);
    }
  };

  const handleOpenCurrentPeriodReader = (period: 'morning' | 'afternoon' | 'night') => {
    let startCh = morningStart;
    let count = planConfig.morningCount;
    let periodName = 'Manhã';

    if (period === 'afternoon') {
      startCh = afternoonStart;
      count = planConfig.afternoonCount;
      periodName = 'Tarde';
    } else if (period === 'night') {
      startCh = nightStart;
      count = planConfig.nightCount;
      periodName = 'Noite';
    }

    const startInfo = getBibleBookAndChapter(startCh);
    const rangeText = formatChapterRange(startCh, count);

    if (useOfficialAlmeida && officialBible) {
      onOpenReader({
        contentType: 'bible',
        contentId: officialBible.id,
        title: 'Bíblia Sagrada',
        subtitle: `Leitura da ${periodName} · ${rangeText}`,
        bookName: startInfo.bookName,
        chapterNumber: startInfo.chapter,
        initialChapterOrDay: startInfo.chapter,
        targetBookName: startInfo.bookName,
        targetChapterNumber: startInfo.chapter,
        bibleBooks: officialBible.books,
        period,
        isReadAlready: periodStatus[period],
      });
    } else if (bibleBook) {
      onOpenReader({
        contentType: 'book',
        contentId: bibleBook.id,
        title: bibleBook.title,
        subtitle: `Leitura da ${periodName} · ${rangeText}`,
        bookData: bibleBook,
        targetChapterQuery: `${startInfo.bookName} ${startInfo.chapter}`,
        period,
        isBible: true,
        isReadAlready: periodStatus[period],
      });
    } else {
      onNavigateTab('bible');
    }
  };

  const handleOpenDevotional = () => {
    if (devotionalBook) {
      onOpenReader({
        contentType: 'book',
        contentId: devotionalBook.id,
        title: devotionalBook.title,
        subtitle: 'Devocional Diário',
        bookData: devotionalBook,
        isDevotional: true,
        isReadAlready: isDevReadToday,
      });
    } else {
      onNavigateTab('devotional');
    }
  };

  const handleOpenBook = (book: Book) => {
    try {
      localStorage.setItem('altto_last_read_book_id', book.id);
      window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId: book.id } }));
    } catch {}
    setFeaturedBook(book);
    getReadingProgress(book.id).then((prog) => {
      setFeaturedProgress(prog ? prog.percentage : book.progressPercent || 0);
    });
    onOpenReader({
      contentType: 'book',
      contentId: book.id,
      title: book.title,
      subtitle: book.author || 'Biblioteca Altto',
      bookData: book,
    });
  };

  const handleSelectFeaturedBook = (book: Book) => {
    setFeaturedBook(book);
    try {
      localStorage.setItem('altto_last_read_book_id', book.id);
      window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId: book.id } }));
    } catch {}
    getReadingProgress(book.id).then((prog) => {
      setFeaturedProgress(prog ? prog.percentage : book.progressPercent || 0);
    });
  };

  // Date Navigation
  const changeDateByDays = (delta: number) => {
    if (!onDateChange) return;
    try {
      const [y, m, d] = activeDate.split('-').map(Number);
      const cur = new Date(y, m - 1, d);
      cur.setDate(cur.getDate() + delta);
      const yStr = cur.getFullYear();
      const mStr = (cur.getMonth() + 1).toString().padStart(2, '0');
      const dStr = cur.getDate().toString().padStart(2, '0');
      onDateChange(`${yStr}-${mStr}-${dStr}`);
    } catch {}
  };

  const formatDateLabel = (dateStr: string) => {
    if (dateStr === todayStr) return 'Hoje';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  // Greeting based on time
  const getGreeting = () => {
    if (currentHour < 12) return 'Bom dia';
    if (currentHour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Timeline Progress Statistics
  const totalTimelineSteps = 5;
  const completedTimelineSteps = [
    periodStatus.morning,
    isDevReadToday,
    periodStatus.afternoon,
    featuredBook && featuredProgress > 0,
    periodStatus.night,
  ].filter(Boolean).length;
  const timelineProgressPercent = Math.round((completedTimelineSteps / totalTimelineSteps) * 100);

  return (
    <div id="home-view-container" className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 overflow-x-hidden w-full">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#292532] text-white px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Editorial & Saudação */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EEEAF5] pb-4">
        <div>
          <span className="text-[11px] font-sans text-[#77619E] tracking-wider uppercase font-semibold">
            {getGreeting()}, {userProfile.name?.split(' ')[0] || 'Leitor'}
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl text-[#292532] mt-0.5 font-normal tracking-tight">
            Sua Jornada Editorial
          </h1>
          <p className="text-xs text-[#817B89] mt-0.5 max-w-md">
            Acompanhe em tempo real a linha do tempo do seu plano bíblico, devocional diário e livro em leitura.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearchModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] hover:border-[#B6A2DB] text-xs text-[#817B89] hover:text-[#292532] transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-[#B6A2DB]" />
            <span>Buscar título...</span>
          </button>
        </div>
      </section>

      {/* 2. LINHA DO TEMPO DIÁRIA (Plano Bíblico + Devocional + Livro Atual) */}
      <section className="bg-white border border-[#EEEAF5] rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs">
        {/* Timeline Header & Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F5F2F9] pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#77619E]" />
              <h2 className="font-editorial text-xl sm:text-2xl text-[#292532]">Linha do Tempo de Leitura</h2>
            </div>
            <p className="text-[11px] sm:text-xs text-[#817B89]">
              Cronologia diária sincronizada: Palavra sagrada, devocional reflexivo e literatura em andamento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Navigator */}
            <div className="inline-flex items-center rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] p-0.5 text-xs">
              <button
                onClick={() => changeDateByDays(-1)}
                title="Dia anterior"
                className="p-1 hover:bg-white rounded-lg text-[#817B89] hover:text-[#292532] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="px-2 font-medium text-[#292532] flex items-center gap-1.5 min-w-[95px] justify-center text-xs">
                <Calendar className="w-3.5 h-3.5 text-[#77619E]" />
                <span>{formatDateLabel(activeDate)}</span>
              </div>
              <button
                onClick={() => changeDateByDays(1)}
                title="Próximo dia"
                className="p-1 hover:bg-white rounded-lg text-[#817B89] hover:text-[#292532] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeDate !== todayStr && onDateChange && (
              <button
                onClick={() => onDateChange(todayStr)}
                className="text-xs text-[#77619E] hover:underline font-medium cursor-pointer"
              >
                Ir para Hoje
              </button>
            )}

            {/* Overall Progress Pill */}
            <div className="inline-flex items-center gap-1.5 bg-[#F5F0FF] border border-[#EEEAF5] px-2.5 py-1 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-[#77619E] animate-pulse" />
              <span className="text-xs font-semibold text-[#77619E]">
                {completedTimelineSteps}/{totalTimelineSteps} ({timelineProgressPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#817B89]">
            <span className="font-medium text-[#292532]">Progresso da Linha do Tempo</span>
            {timelineProgressPercent === 100 ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Jornada Diária Completa!
              </span>
            ) : (
              <span>{totalTimelineSteps - completedTimelineSteps} restante(s)</span>
            )}
          </div>
          <div className="w-full h-1.5 bg-[#F5F2F9] rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-[#B6A2DB] to-[#77619E] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.max(4, timelineProgressPercent)}%` }}
            />
          </div>
        </div>

        {/* Filter Chips / Tabs — 100% Compactos e sem rolagem lateral */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-xs">
          <button
            onClick={() => setTimelineFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] sm:text-xs ${
              timelineFilter === 'all'
                ? 'bg-[#77619E] text-white shadow-xs'
                : 'bg-[#FBF9FF] text-[#817B89] hover:text-[#292532] border border-[#EEEAF5]'
            }`}
          >
            Linha Completa (5)
          </button>
          <button
            onClick={() => setTimelineFilter('bible')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] sm:text-xs ${
              timelineFilter === 'bible'
                ? 'bg-[#77619E] text-white shadow-xs'
                : 'bg-[#FBF9FF] text-[#817B89] hover:text-[#292532] border border-[#EEEAF5]'
            }`}
          >
            Plano Bíblico (3)
          </button>
          <button
            onClick={() => setTimelineFilter('devotional')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] sm:text-xs ${
              timelineFilter === 'devotional'
                ? 'bg-[#77619E] text-white shadow-xs'
                : 'bg-[#FBF9FF] text-[#817B89] hover:text-[#292532] border border-[#EEEAF5]'
            }`}
          >
            Devocional (1)
          </button>
          <button
            onClick={() => setTimelineFilter('book')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] sm:text-xs ${
              timelineFilter === 'book'
                ? 'bg-[#77619E] text-white shadow-xs'
                : 'bg-[#FBF9FF] text-[#817B89] hover:text-[#292532] border border-[#EEEAF5]'
            }`}
          >
            Continuar Leitura (1)
          </button>
        </div>

        {/* Chronological Timeline Body */}
        <div className="relative pl-6 sm:pl-8 space-y-5 sm:space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#EAE4F3] w-full max-w-full min-w-0">
          {/* STEP 1: Plano Bíblico - Manhã */}
          {(timelineFilter === 'all' || timelineFilter === 'bible') && (
            <div className="relative group w-full max-w-full min-w-0">
              {/* Timeline Node Icon */}
              <div
                className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  periodStatus.morning
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : currentPeriod === 'morning'
                    ? 'bg-[#77619E] border-[#77619E] text-white ring-4 ring-[#77619E]/20'
                    : 'bg-white border-[#B6A2DB] text-[#77619E]'
                }`}
              >
                {periodStatus.morning ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Card Container */}
              <div
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all w-full max-w-full min-w-0 overflow-hidden ${
                  periodStatus.morning
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : currentPeriod === 'morning'
                    ? 'bg-[#FBF9FF] border-[#B6A2DB] shadow-xs'
                    : 'bg-white border-[#EEEAF5] hover:border-[#DCD4EB]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
                  <div className="space-y-1 w-full max-w-full min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap max-w-full">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] shrink-0">
                        08:00 · Manhã · Plano Bíblico
                      </span>
                      {currentPeriod === 'morning' && !periodStatus.morning && (
                        <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          Momento Atual
                        </span>
                      )}
                      {periodStatus.morning && (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />
                          Concluído
                        </span>
                      )}
                    </div>

                    <h3 className="font-editorial text-base sm:text-lg text-[#292532] font-medium truncate block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      Manhã: {morningChapters}
                    </h3>
                    <p className="text-xs text-[#817B89] line-clamp-2">
                      Inicie o dia meditando nos primeiros capítulos propostos para o plano.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <button
                      onClick={(e) => handleToggleBiblePeriod('morning', e)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        periodStatus.morning
                          ? 'bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#292532] hover:border-[#B6A2DB]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{periodStatus.morning ? 'Desmarcar' : 'Marcar Lido'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenCurrentPeriodReader('morning')}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Ler Capítulo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Devocional Diário */}
          {(timelineFilter === 'all' || timelineFilter === 'devotional') && (
            <div className="relative group w-full max-w-full min-w-0">
              {/* Timeline Node Icon */}
              <div
                className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  isDevReadToday
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-[#B6A2DB] text-[#77619E]'
                }`}
              >
                {isDevReadToday ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Card Container */}
              <div
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all w-full max-w-full min-w-0 overflow-hidden ${
                  isDevReadToday
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : 'bg-white border-[#EEEAF5] hover:border-[#DCD4EB]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
                  <div className="space-y-1 w-full max-w-full min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap max-w-full">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/70 shrink-0">
                        10:30 · Reflexão · Devocional Diário
                      </span>
                      {isDevReadToday ? (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />
                          Concluído
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium bg-[#F5F0FF] text-[#77619E] px-2 py-0.5 rounded-full border border-[#EEEAF5] shrink-0">
                          Pendente
                        </span>
                      )}
                    </div>

                    <h3 className="font-editorial text-base sm:text-lg text-[#292532] font-medium truncate block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      {devotionalBook ? devotionalBook.title : '365 Dias com Deus – Meditação'}
                    </h3>
                    <p className="text-xs text-[#817B89] line-clamp-2">
                      Pausa sagrada para aquietar o coração, meditar nas promessas e registrar notas espirituais.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <button
                      onClick={handleToggleDevotional}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        isDevReadToday
                          ? 'bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#292532] hover:border-[#B6A2DB]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isDevReadToday ? 'Desmarcar' : 'Marcar Lido'}</span>
                    </button>

                    <button
                      onClick={handleOpenDevotional}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <BookMarked className="w-3.5 h-3.5" />
                      <span>Ler Devocional</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Plano Bíblico - Tarde */}
          {(timelineFilter === 'all' || timelineFilter === 'bible') && (
            <div className="relative group w-full max-w-full min-w-0">
              {/* Timeline Node Icon */}
              <div
                className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  periodStatus.afternoon
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : currentPeriod === 'afternoon'
                    ? 'bg-[#77619E] border-[#77619E] text-white ring-4 ring-[#77619E]/20'
                    : 'bg-white border-[#B6A2DB] text-[#77619E]'
                }`}
              >
                {periodStatus.afternoon ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Sunset className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Card Container */}
              <div
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all w-full max-w-full min-w-0 overflow-hidden ${
                  periodStatus.afternoon
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : currentPeriod === 'afternoon'
                    ? 'bg-[#FBF9FF] border-[#B6A2DB] shadow-xs'
                    : 'bg-white border-[#EEEAF5] hover:border-[#DCD4EB]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
                  <div className="space-y-1 w-full max-w-full min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap max-w-full">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] shrink-0">
                        14:00 · Tarde · Plano Bíblico
                      </span>
                      {currentPeriod === 'afternoon' && !periodStatus.afternoon && (
                        <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          Momento Atual
                        </span>
                      )}
                      {periodStatus.afternoon && (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />
                          Concluído
                        </span>
                      )}
                    </div>

                    <h3 className="font-editorial text-base sm:text-lg text-[#292532] font-medium truncate block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      Tarde: {afternoonChapters}
                    </h3>
                    <p className="text-xs text-[#817B89] line-clamp-2">
                      Continuação do plano para alimentar a mente no decorrer da rotina.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <button
                      onClick={(e) => handleToggleBiblePeriod('afternoon', e)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        periodStatus.afternoon
                          ? 'bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#292532] hover:border-[#B6A2DB]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{periodStatus.afternoon ? 'Desmarcar' : 'Marcar Lido'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenCurrentPeriodReader('afternoon')}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Ler Capítulo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: LIVRO QUE ESTIVER SENDO LIDO NO MOMENTO (CONTINUAR LEITURA) */}
          {(timelineFilter === 'all' || timelineFilter === 'book') && (
            <div className="relative group w-full max-w-full min-w-0">
              {/* Timeline Node Icon */}
              <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all bg-white border-[#77619E] text-[#77619E] shadow-2xs">
                <BookOpen className="w-3.5 h-3.5" />
              </div>

              {/* Card Container */}
              <div className="p-3.5 sm:p-5 rounded-2xl border border-[#EEEAF5] bg-[#FBF9FF] hover:border-[#B6A2DB] transition-all w-full max-w-full min-w-0 overflow-hidden box-border">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between w-full max-w-full min-w-0">
                  {featuredBook ? (
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4 w-full max-w-full min-w-0 flex-1 overflow-hidden">
                      {/* Book Cover Thumbnail with preserved aspect ratio */}
                      <div
                        onClick={() => handleOpenBook(featuredBook)}
                        className="w-14 sm:w-16 md:w-20 aspect-[2/3] shrink-0 rounded-lg overflow-hidden border border-[#EEEAF5] bg-white shadow-2xs cursor-pointer group/thumb relative select-none"
                      >
                        {featuredBook.coverUrl ? (
                          <img
                            src={featuredBook.coverUrl}
                            alt={featuredBook.title}
                            className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-[#F5F0FF] text-[#77619E]">
                            <BookOpen className="w-5 h-5 mb-0.5 opacity-60" />
                            <span className="text-[8px] line-clamp-2 font-editorial leading-tight">
                              {featuredBook.title}
                            </span>
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 text-[8px] uppercase tracking-wider font-semibold bg-black/60 text-white px-1 py-0.2 rounded">
                          {featuredBook.format}
                        </span>
                      </div>

                      {/* Info & Progress */}
                      <div className="w-full max-w-full min-w-0 flex-1 space-y-1.5 overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-full">
                          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200/70 shrink-0">
                            17:00 · Continuar Leitura
                          </span>
                          <span className="text-[10px] font-medium bg-[#F5F0FF] text-[#77619E] px-2 py-0.5 rounded-full border border-[#EEEAF5] shrink-0">
                            {Math.round(featuredProgress)}% lido
                          </span>
                        </div>

                        <div className="w-full max-w-full min-w-0 overflow-hidden">
                          <h3
                            onClick={() => handleOpenBook(featuredBook)}
                            className="font-editorial text-sm sm:text-base md:text-lg text-[#292532] hover:text-[#77619E] cursor-pointer transition-colors block w-full max-w-full truncate overflow-hidden text-ellipsis whitespace-nowrap font-medium"
                            title={featuredBook.title}
                          >
                            {featuredBook.title}
                          </h3>
                          <p
                            className="text-xs text-[#817B89] block w-full max-w-full truncate overflow-hidden text-ellipsis whitespace-nowrap mt-0.5"
                            title={featuredBook.author || 'Autor da obra'}
                          >
                            {featuredBook.author || 'Autor desconhecido'}
                          </p>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="space-y-1 w-full max-w-full min-w-0">
                          <div className="w-full h-1.5 bg-[#EEEAF5] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#77619E] rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(5, Math.min(100, featuredProgress))}%` }}
                            />
                          </div>
                        </div>

                        {/* Switcher if multiple books in progress */}
                        {inProgressBooks.length > 1 && (
                          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-[#817B89] w-full max-w-full min-w-0 overflow-hidden">
                            <span className="shrink-0 text-[10px]">Trocar:</span>
                            <div className="flex items-center gap-1 py-0.5 overflow-x-auto no-scrollbar max-w-full min-w-0 flex-1">
                              {inProgressBooks.map((b) => (
                                <button
                                  key={b.id}
                                  onClick={() => handleSelectFeaturedBook(b)}
                                  title={b.title}
                                  className={`px-2 py-0.5 rounded-md border text-[10px] truncate max-w-[90px] shrink-0 transition-colors cursor-pointer ${
                                    featuredBook.id === b.id
                                      ? 'bg-[#77619E] text-white border-[#77619E]'
                                      : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#292532]'
                                  }`}
                                >
                                  {b.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 flex-1 w-full max-w-full min-w-0 overflow-hidden">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200/70 shrink-0">
                        17:00 · Continuar Leitura
                      </span>
                      <h3 className="font-editorial text-base sm:text-lg text-[#292532] truncate block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                        Nenhum livro aberto no momento
                      </h3>
                      <p className="text-xs text-[#817B89] line-clamp-2">
                        Importe arquivos PDF ou EPUB na biblioteca para acompanhar seu progresso de leitura aqui.
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    {featuredBook ? (
                      <>
                        <button
                          onClick={() => onNavigateTab('library')}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-[#EEEAF5] text-[#817B89] hover:text-[#292532] hover:border-[#B6A2DB] transition-colors cursor-pointer shrink-0"
                        >
                          Biblioteca
                        </button>
                        <button
                          onClick={() => handleOpenBook(featuredBook)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Continuar Lendo</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onNavigateTab('library')}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Abrir Biblioteca</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Plano Bíblico - Noite */}
          {(timelineFilter === 'all' || timelineFilter === 'bible') && (
            <div className="relative group w-full max-w-full min-w-0">
              {/* Timeline Node Icon */}
              <div
                className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  periodStatus.night
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : currentPeriod === 'night'
                    ? 'bg-[#77619E] border-[#77619E] text-white ring-4 ring-[#77619E]/20'
                    : 'bg-white border-[#B6A2DB] text-[#77619E]'
                }`}
              >
                {periodStatus.night ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </div>

              {/* Card Container */}
              <div
                className={`p-3.5 sm:p-5 rounded-2xl border transition-all w-full max-w-full min-w-0 overflow-hidden ${
                  periodStatus.night
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : currentPeriod === 'night'
                    ? 'bg-[#FBF9FF] border-[#B6A2DB] shadow-xs'
                    : 'bg-white border-[#EEEAF5] hover:border-[#DCD4EB]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
                  <div className="space-y-1 w-full max-w-full min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap max-w-full">
                      <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] shrink-0">
                        21:00 · Noite · Plano Bíblico
                      </span>
                      {currentPeriod === 'night' && !periodStatus.night && (
                        <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          Momento Atual
                        </span>
                      )}
                      {periodStatus.night && (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />
                          Concluído
                        </span>
                      )}
                    </div>

                    <h3 className="font-editorial text-base sm:text-lg text-[#292532] font-medium truncate block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      Noite: {nightChapters}
                    </h3>
                    <p className="text-xs text-[#817B89] line-clamp-2">
                      Encerramento do dia em paz e serenidade sob a Palavra.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0 w-full sm:w-auto justify-start sm:justify-end">
                    <button
                      onClick={(e) => handleToggleBiblePeriod('night', e)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        periodStatus.night
                          ? 'bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#292532] hover:border-[#B6A2DB]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{periodStatus.night ? 'Desmarcar' : 'Marcar Lido'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenCurrentPeriodReader('night')}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Ler Capítulo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#EEEAF5] shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#77619E]" />
                <span className="text-sm font-semibold text-[#292532]">Buscar Livros</span>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-[#817B89] hover:text-[#292532] cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <input
              type="text"
              autoFocus
              placeholder="Digite o título ou autor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
            />

            <div className="max-h-60 overflow-y-auto space-y-2">
              {allBooks
                .filter(b =>
                  searchQuery ? b.title.toLowerCase().includes(searchQuery.toLowerCase()) : true
                )
                .slice(0, 5)
                .map(book => (
                  <div
                    key={book.id}
                    onClick={() => {
                      setShowSearchModal(false);
                      handleOpenBook(book);
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F5F0FF] cursor-pointer transition-colors"
                  >
                    <div className="w-8 h-11 bg-[#FBF9FF] rounded border border-[#EEEAF5] overflow-hidden shrink-0">
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen className="w-4 h-4 m-auto text-[#77619E]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#292532] truncate">{book.title}</div>
                      <div className="text-[10px] text-[#817B89] truncate">{book.author}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#A09AA8]" />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
