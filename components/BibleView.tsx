'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Sun,
  Sunset,
  Moon,
  Clock,
  Sparkles,
  Library,
  Plus,
  Minus,
  Check,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Edit3,
  Compass,
  Upload,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { Book, Bible } from '@/types';
import { getBooks, importBookFromFile } from '@/lib/bookService';
import { getBibles, importOfficialAlmeidaBible } from '@/lib/bibleService';
import {
  BIBLE_BOOKS_CATALOG,
  getBibleBookAndChapter,
  formatChapterRange,
  getGlobalChapterFromBook,
  getChaptersForDate,
  getDateLockDetails,
} from '@/lib/bibleData';

interface BibleViewProps {
  onOpenReader: (params: {
    contentType: 'book' | 'bible';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData?: Book;
    bookName?: string;
    chapterNumber?: number;
    targetBookName?: string;
    targetChapterNumber?: number;
    targetChapterQuery?: string;
    bibleBooks?: any[];
    period?: 'morning' | 'afternoon' | 'night' | string;
    isReadAlready?: boolean;
    initialChapterOrDay?: number;
  }) => void;
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

export const BibleView: React.FC<BibleViewProps> = ({
  onOpenReader,
  selectedDateStr,
  onDateChange,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeDate = selectedDateStr || todayStr;

  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [officialBibles, setOfficialBibles] = useState<Bible[]>([]);
  const [selectedBibleBook, setSelectedBibleBook] = useState<Book | null>(null);
  const [_selectedOfficialBible, setSelectedOfficialBible] = useState<Bible | null>(null);
  const [useOfficialAlmeida, setUseOfficialAlmeida] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

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

  const [showBiblePickerModal, setShowBiblePickerModal] = useState<boolean>(false);
  const [isImportingBible, setIsImportingBible] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  const [showJumpModal, setShowJumpModal] = useState<boolean>(false);
  const [jumpBookId, setJumpBookId] = useState<string>('GEN');
  const [jumpChapter, setJumpChapter] = useState<number>(1);

  const [morningNote, setMorningNote] = useState<string>('');
  const [afternoonNote, setAfternoonNote] = useState<string>('');
  const [nightNote, setNightNote] = useState<string>('');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [_refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      try {
        const books = await getBooks();
        if (isCancelled) return;
        setLibraryBooks(books);

        const bibles = await getBibles();
        if (isCancelled) return;
        if (bibles.length === 0) {
          try {
            const imported = await importOfficialAlmeidaBible();
            if (!isCancelled) setOfficialBibles([imported]);
          } catch {
            if (!isCancelled) setOfficialBibles([]);
          }
        } else {
          setOfficialBibles(bibles);
        }

        const savedConfig = localStorage.getItem('altto_bible_plan_config');
        if (savedConfig) {
          try {
            if (!isCancelled) setPlanConfig(JSON.parse(savedConfig));
          } catch {
            if (!isCancelled) setPlanConfig({ morningCount: 1, afternoonCount: 1, nightCount: 1 });
          }
        }

        const savedStartDate = localStorage.getItem('altto_bible_plan_start_date');
        if (savedStartDate) {
          if (!isCancelled) setPlanStartDate(savedStartDate);
        } else {
          localStorage.setItem('altto_bible_plan_start_date', todayStr);
          if (!isCancelled) setPlanStartDate(todayStr);
        }

        const savedStartChapter = localStorage.getItem('altto_bible_plan_start_chapter');
        if (savedStartChapter) {
          const ch = parseInt(savedStartChapter, 10);
          if (!isNaN(ch) && ch >= 1 && ch <= 1189) {
            if (!isCancelled) setPlanStartChapter(ch);
          }
        } else {
          const oldChapter = localStorage.getItem('altto_bible_current_chapter');
          const ch = oldChapter ? parseInt(oldChapter, 10) : 1;
          const validCh = !isNaN(ch) && ch >= 1 && ch <= 1189 ? ch : 1;
          localStorage.setItem('altto_bible_plan_start_chapter', validCh.toString());
          if (!isCancelled) setPlanStartChapter(validCh);
        }

        const savedBibleBookId = localStorage.getItem('altto_selected_bible_book_id');
        const isAlmeida = localStorage.getItem('altto_use_official_almeida') === 'true';

        if (isCancelled) return;
        if (isAlmeida) {
          setUseOfficialAlmeida(true);
          if (bibles.length > 0) {
            setSelectedOfficialBible(bibles[0]);
          }
        } else if (savedBibleBookId) {
          const found = books.find(b => b.id === savedBibleBookId);
          if (found) {
            setSelectedBibleBook(found);
            setUseOfficialAlmeida(false);
          } else if (books.length > 0) {
            setSelectedBibleBook(books[0]);
            setUseOfficialAlmeida(false);
          } else {
            setUseOfficialAlmeida(true);
          }
        } else if (books.length > 0) {
          const bibleCandidate = books.find(
            b => b.title.toLowerCase().includes('bíblia') || b.title.toLowerCase().includes('biblia')
          );
          setSelectedBibleBook(bibleCandidate || books[0]);
          setUseOfficialAlmeida(false);
          localStorage.setItem('altto_selected_bible_book_id', (bibleCandidate || books[0]).id);
        } else {
          setUseOfficialAlmeida(true);
        }

        const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
        if (savedStatus) {
          try {
            if (!isCancelled) setPeriodStatus(JSON.parse(savedStatus));
          } catch {
            if (!isCancelled) setPeriodStatus({ morning: false, afternoon: false, night: false });
          }
        } else {
          if (!isCancelled) setPeriodStatus({ morning: false, afternoon: false, night: false });
        }

        const savedNotes = localStorage.getItem(`altto_bible_notes_${activeDate}`);
        if (savedNotes) {
          try {
            const parsed = JSON.parse(savedNotes);
            if (!isCancelled) {
              setMorningNote(parsed.morning || '');
              setAfternoonNote(parsed.afternoon || '');
              setNightNote(parsed.night || '');
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Erro ao carregar dados da Bíblia:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      isCancelled = true;
    };
  }, [activeDate, _refreshTrigger, todayStr]);

  const updatePeriodCount = (period: 'morning' | 'afternoon' | 'night', delta: number) => {
    setPlanConfig(prev => {
      const current = prev[`${period}Count`];
      const nextVal = Math.max(1, Math.min(20, current + delta));
      const updated = { ...prev, [`${period}Count`]: nextVal };
      localStorage.setItem('altto_bible_plan_config', JSON.stringify(updated));
      return updated;
    });
    setToastMessage(`✓ Capítulos da ${period === 'morning' ? 'Manhã' : period === 'afternoon' ? 'Tarde' : 'Noite'} atualizados!`);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const lockDetails = getDateLockDetails(activeDate, todayStr, planStartDate);
  const isDateLocked = lockDetails.isLocked;

  const isMorningLocked = isDateLocked;
  const isAfternoonLocked = isDateLocked || !periodStatus.morning;
  const isNightLocked = isDateLocked || !periodStatus.afternoon;

  const getLockBlockedMessage = () => {
    if (lockDetails.blockingDate) {
      const periodName =
        lockDetails.blockingPeriod === 'morning'
          ? 'Manhã'
          : lockDetails.blockingPeriod === 'afternoon'
          ? 'Tarde'
          : 'Noite';
      return `🔒 Bloqueado: Conclua os capítulos pendentes (${periodName}) do dia ${lockDetails.blockingDate} primeiro.`;
    }
    return `🔒 Bloqueado: Conclua os capítulos de dias anteriores primeiro.`;
  };

  useEffect(() => {
    const handleStatusSync = () => {
      const savedStatus = localStorage.getItem(`altto_bible_status_${activeDate}`);
      if (savedStatus) {
        try {
          setPeriodStatus(JSON.parse(savedStatus));
        } catch {}
      }
    };
    window.addEventListener('altto_bible_status_updated', handleStatusSync);
    return () => window.removeEventListener('altto_bible_status_updated', handleStatusSync);
  }, [activeDate]);

  const handleTogglePeriod = (period: 'morning' | 'afternoon' | 'night') => {
    if (isDateLocked) {
      setToastMessage(getLockBlockedMessage());
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }
    if (period === 'afternoon' && !periodStatus.morning) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }
    if (period === 'night' && !periodStatus.afternoon) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }

    setPeriodStatus(prev => {
      const willBeDone = !prev[period];
      const updated = { ...prev, [period]: willBeDone };
      if (period === 'morning' && !willBeDone) {
        updated.afternoon = false;
        updated.night = false;
      } else if (period === 'afternoon' && !willBeDone) {
        updated.night = false;
      }
      localStorage.setItem(`altto_bible_status_${activeDate}`, JSON.stringify(updated));
      window.dispatchEvent(new Event('altto_bible_status_updated'));
      if (willBeDone) {
        if (period === 'morning') {
          setToastMessage('✓ Manhã concluída! Turno da Tarde liberado.');
        } else if (period === 'afternoon') {
          setToastMessage('✓ Tarde concluída! Turno da Noite liberado.');
        } else if (period === 'night') {
          setToastMessage('Glória a Deus! Você concluiu todas as leituras de hoje!');
        }
        setTimeout(() => setToastMessage(''), 4000);
      }
      return updated;
    });
  };

  const handleSelectLibraryBible = (book: Book) => {
    setSelectedBibleBook(book);
    setUseOfficialAlmeida(false);
    localStorage.setItem('altto_selected_bible_book_id', book.id);
    localStorage.setItem('altto_use_official_almeida', 'false');
    setShowBiblePickerModal(false);
    setToastMessage(`✓ "${book.title}" definida como sua Bíblia!`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleSelectAlmeidaBible = () => {
    setUseOfficialAlmeida(true);
    setSelectedBibleBook(null);
    localStorage.setItem('altto_use_official_almeida', 'true');
    setShowBiblePickerModal(false);
    setToastMessage('Bíblia João Ferreira de Almeida selecionada!');
    setTimeout(() => setToastMessage(''), 3500);
  };

  const chaptersPlan = getChaptersForDate({
    activeDate,
    planStartDate,
    planStartChapter,
    morningCount: planConfig.morningCount,
    afternoonCount: planConfig.afternoonCount,
    nightCount: planConfig.nightCount,
  });

  const {
    morningStart,
    morningEnd,
    afternoonStart,
    afternoonEnd,
    nightStart,
    nightEnd,
    totalDaily,
  } = chaptersPlan;

  const handleNavigateDate = (offsetDays: number) => {
    const [y, m, d] = activeDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + offsetDays);
    const ny = dateObj.getFullYear();
    const nm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const nd = dateObj.getDate().toString().padStart(2, '0');
    const newDateStr = `${ny}-${nm}-${nd}`;
    if (onDateChange) {
      onDateChange(newDateStr);
    }
  };

  const handleGoToToday = () => {
    if (onDateChange) {
      onDateChange(todayStr);
    }
  };

  const handleOpenPeriodReader = (
    startGlobal: number,
    count: number,
    period: 'morning' | 'afternoon' | 'night',
    periodLabel: string
  ) => {
    if (isDateLocked) {
      setToastMessage(getLockBlockedMessage());
      setTimeout(() => setToastMessage(''), 4500);
      return;
    }
    if (period === 'afternoon' && !periodStatus.morning) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Manhã primeiro para liberar a Tarde.');
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }
    if (period === 'night' && !periodStatus.afternoon) {
      setToastMessage('🔒 Bloqueado: Conclua a leitura da Tarde primeiro para liberar a Noite.');
      setTimeout(() => setToastMessage(''), 4000);
      return;
    }

    const chapterInfo = getBibleBookAndChapter(startGlobal);

    if (useOfficialAlmeida || !selectedBibleBook) {
      const bibleToUse = officialBibles[0];
      onOpenReader({
        contentType: 'bible',
        contentId: bibleToUse ? bibleToUse.id : 'official-almeida',
        title: `Bíblia Sagrada – ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookName: chapterInfo.bookName,
        chapterNumber: chapterInfo.chapter,
        targetBookName: chapterInfo.bookName,
        targetChapterNumber: chapterInfo.chapter,
        targetChapterQuery: `${chapterInfo.bookName} ${chapterInfo.chapter}`,
        bibleBooks: bibleToUse?.books,
        period,
      });
    } else {
      onOpenReader({
        contentType: 'book',
        contentId: selectedBibleBook.id,
        title: `${selectedBibleBook.title} – ${periodLabel}`,
        subtitle: formatChapterRange(startGlobal, count),
        bookData: selectedBibleBook,
        bookName: chapterInfo.bookName,
        chapterNumber: chapterInfo.chapter,
        targetBookName: chapterInfo.bookName,
        targetChapterNumber: chapterInfo.chapter,
        targetChapterQuery: `${chapterInfo.bookName} ${chapterInfo.chapter}`,
        period,
      });
    }
  };

  const handleAdvanceNextDay = () => {
    handleNavigateDate(1);
    setToastMessage(`✓ Avançado para o dia seguinte!`);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleConfirmJump = () => {
    const targetGlobal = getGlobalChapterFromBook(jumpBookId, jumpChapter);
    setPlanStartChapter(targetGlobal);
    setPlanStartDate(activeDate);
    localStorage.setItem('altto_bible_plan_start_chapter', targetGlobal.toString());
    localStorage.setItem('altto_bible_plan_start_date', activeDate);
    setShowJumpModal(false);
    const info = getBibleBookAndChapter(targetGlobal);
    setToastMessage(`✓ Plano iniciado em ${info.bookName} ${info.chapter}!`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleDirectImportBible = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsImportingBible(true);
      const newBook = await importBookFromFile(file);
      setRefreshTrigger(n => n + 1);
      handleSelectLibraryBible(newBook);
      setShowBiblePickerModal(false);
      setToastMessage(`Bíblia "${newBook.title}" importada!`);
      setTimeout(() => setToastMessage(''), 3500);
    } catch (err) {
      console.error(err);
      setToastMessage('Erro ao importar arquivo');
      setTimeout(() => setToastMessage(''), 3500);
    } finally {
      setIsImportingBible(false);
    }
  };

  const handleSaveNotes = () => {
    const notes = { morning: morningNote, afternoon: afternoonNote, night: nightNote };
    localStorage.setItem(`altto_bible_notes_${activeDate}`, JSON.stringify(notes));
    setToastMessage('✓ Anotações da Bíblia salvas com sucesso!');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const completedCount =
    (periodStatus.morning ? 1 : 0) +
    (periodStatus.afternoon ? 1 : 0) +
    (periodStatus.night ? 1 : 0);
  const isAllCompletedToday = completedCount === 3;
  const currentGlobalChapter = morningStart;
  const totalToday = totalDaily;
  const currentInfo = getBibleBookAndChapter(currentGlobalChapter);
  const bibleProgressPercent = Math.min(100, Math.round((currentGlobalChapter / 1189) * 100));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-[#817B89] gap-3">
        <div className="w-8 h-8 border-2 border-[#77619E] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando plano de leitura bíblica...</span>
      </div>
    );
  }

  return (
    <div id="bible-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7 text-[#292532] bg-[#FFFFFF] min-h-screen">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-5 flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#77619E]">
              Plano de Leitura
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-normal font-editorial tracking-tight text-[#292532]">
            Leitura da Palavra
          </h1>
          <p className="text-xs sm:text-sm text-[#817B89]">
            Três momentos organizados ao longo do dia (Manhã, Tarde e Noite).
          </p>
        </div>

        <button
          onClick={() => setShowBiblePickerModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#FBF9FF] hover:bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] transition-colors cursor-pointer"
        >
          <Library className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Trocar Bíblia</span>
        </button>
      </div>

      {/* Date Navigation Ribbon */}
      <div className="bg-[#FBF9FF] border border-[#EEEAF5] rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={() => handleNavigateDate(-1)}
            className="p-2 rounded-xl bg-white border border-[#EEEAF5] hover:bg-[#F5F0FF] text-[#817B89] hover:text-[#292532] transition-colors cursor-pointer"
            title="Dia anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#B6A2DB] shrink-0" />
            <input
              type="date"
              value={activeDate}
              onChange={e => onDateChange && onDateChange(e.target.value)}
              className="bg-white border border-[#EEEAF5] rounded-xl px-3 py-1.5 text-xs font-medium text-[#292532] focus:outline-none focus:border-[#B6A2DB] cursor-pointer"
            />
          </div>
          <button
            onClick={() => handleNavigateDate(1)}
            className="p-2 rounded-xl bg-white border border-[#EEEAF5] hover:bg-[#F5F0FF] text-[#817B89] hover:text-[#292532] transition-colors cursor-pointer"
            title="Próximo dia"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {activeDate === todayStr ? (
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-medium text-xs border border-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Hoje ({activeDate})
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-white text-[#817B89] font-medium text-xs border border-[#EEEAF5]">
              Data: {activeDate}
            </span>
          )}

          {activeDate !== todayStr && (
            <button
              onClick={handleGoToToday}
              className="px-3 py-1 rounded-xl text-xs font-medium text-[#77619E] bg-[#F5F0FF] border border-[#EEEAF5] hover:bg-[#EEEAF5] transition-colors cursor-pointer"
            >
              Voltar para Hoje
            </button>
          )}
        </div>
      </div>

      {/* Lock Banner if day is locked */}
      {isDateLocked && (
        <div className="p-4 bg-[#FBF9FF] border border-[#EEEAF5] rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-[#292532] text-xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-sm block font-editorial text-[#292532]">Leituras bloqueadas</span>
              <span className="text-[#817B89] text-xs leading-relaxed">
                Conclua os capítulos pendentes dos dias anteriores para liberar as próximas etapas da leitura.
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (lockDetails.blockingDate && onDateChange) {
                onDateChange(lockDetails.blockingDate);
              } else {
                handleGoToToday();
              }
            }}
            className="px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white font-medium text-xs shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <span>Ir para Dia Pendente</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Card da Bíblia Ativa */}
      <div className="bg-[#FFFFFF] border border-[#EEEAF5] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between text-xs font-medium text-[#77619E] border-b border-[#EEEAF5] pb-3">
          <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-[#B6A2DB]" />
            Bíblia Selecionada
          </span>
          <span className="px-2.5 py-0.5 rounded-md bg-[#F5F0FF] text-[#77619E] font-medium text-[10px] border border-[#EEEAF5]">
            {useOfficialAlmeida || !selectedBibleBook ? 'TEXTO DIGITAL OFICIAL' : selectedBibleBook.format.toUpperCase()}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div
            onClick={() => handleOpenPeriodReader(morningStart, planConfig.morningCount, 'morning', 'Manhã')}
            className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden bg-[#FBF9FF] border border-[#EEEAF5] shadow-xs shrink-0 cursor-pointer group hover:border-[#B6A2DB] transition-all"
          >
            {selectedBibleBook?.coverUrl ? (
              <img
                src={selectedBibleBook.coverUrl}
                alt=""
                className="w-full h-full object-cover group-hover:scale-103 transition-transform"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#F5F0FF] text-[#77619E]">
                <BookOpen className="w-6 h-6 mb-1 opacity-60" />
                <span className="text-[9px] font-editorial line-clamp-2">
                  {useOfficialAlmeida || !selectedBibleBook ? 'Bíblia Almeida' : selectedBibleBook.title}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2.5 text-center sm:text-left min-w-0">
            <div>
              <h2 className="text-base sm:text-lg font-normal font-editorial text-[#292532] leading-snug">
                {useOfficialAlmeida || !selectedBibleBook
                  ? 'Bíblia Sagrada – João Ferreira de Almeida'
                  : selectedBibleBook.title}
              </h2>
              <p className="text-xs text-[#817B89]">
                {useOfficialAlmeida || !selectedBibleBook
                  ? 'Tradução clássica completa (66 livros do Antigo e Novo Testamento)'
                  : selectedBibleBook.author || 'Bíblia da sua biblioteca'}
              </p>
            </div>

            <div className="space-y-1.5 max-w-md">
              <div className="flex justify-between text-xs text-[#817B89]">
                <span>Posição: <strong className="text-[#292532]">{currentInfo.bookName} {currentInfo.chapter}</strong></span>
                <span className="text-[#77619E] font-medium">{currentGlobalChapter} de 1.189 caps ({bibleProgressPercent}%)</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#EEEAF5] overflow-hidden">
                <div
                  className="h-full bg-[#77619E] rounded-full transition-all duration-300"
                  style={{ width: `${bibleProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center justify-center sm:justify-start pt-1 text-xs">
              <button
                onClick={() => setShowBiblePickerModal(true)}
                className="text-[#77619E] hover:text-[#68538D] font-medium cursor-pointer"
              >
                Trocar Bíblia
              </button>
              <span className="text-[#EEEAF5]">·</span>
              <button
                onClick={() => {
                  const info = getBibleBookAndChapter(currentGlobalChapter);
                  setJumpBookId(info.bookId);
                  setJumpChapter(info.chapter);
                  setShowJumpModal(true);
                }}
                className="text-[#77619E] hover:text-[#68538D] font-medium cursor-pointer flex items-center gap-1"
              >
                <Compass className="w-3.5 h-3.5 text-[#B6A2DB]" />
                <span>Pular para Livro / Capítulo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Steppers: Meta Diária de Capítulos */}
      <div className="bg-[#FFFFFF] border border-[#EEEAF5] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-editorial text-base text-[#292532]">
              Capítulos em Cada Momento
            </h3>
            <p className="text-xs text-[#817B89]">
              Distribuição padrão de leitura (ajuste livremente):
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-[#F5F0FF] text-[#77619E] font-medium text-xs border border-[#EEEAF5]">
            Total: {totalToday} {totalToday === 1 ? 'capítulo' : 'capítulos'} por dia
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Manhã */}
          <div className="p-3.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#292532] block leading-tight">Manhã</span>
                <span className="text-[10px] text-[#817B89]">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('morning', -1)}
                disabled={planConfig.morningCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] disabled:opacity-30 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-medium text-xs text-[#292532]">
                {planConfig.morningCount}
              </span>
              <button
                onClick={() => updatePeriodCount('morning', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tarde */}
          <div className="p-3.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                <Sunset className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#292532] block leading-tight">Tarde</span>
                <span className="text-[10px] text-[#817B89]">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('afternoon', -1)}
                disabled={planConfig.afternoonCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] disabled:opacity-30 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-medium text-xs text-[#292532]">
                {planConfig.afternoonCount}
              </span>
              <button
                onClick={() => updatePeriodCount('afternoon', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Noite */}
          <div className="p-3.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#292532] block leading-tight">Noite</span>
                <span className="text-[10px] text-[#817B89]">Capítulos</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updatePeriodCount('night', -1)}
                disabled={planConfig.nightCount <= 1}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] disabled:opacity-30 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-medium text-xs text-[#292532]">
                {planConfig.nightCount}
              </span>
              <button
                onClick={() => updatePeriodCount('night', 1)}
                className="w-7 h-7 rounded-lg bg-white border border-[#EEEAF5] flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3 MOMENTOS DO DIA CARDS */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-editorial text-lg text-[#292532] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#B6A2DB]" />
            <span>Leituras do Dia</span>
          </h3>
          <span className="text-xs text-[#77619E] font-medium">
            {completedCount} de 3 concluídas
          </span>
        </div>

        {/* 1. MANHÃ */}
        <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          periodStatus.morning
            ? 'bg-emerald-50/50 border-emerald-200'
            : isMorningLocked
            ? 'bg-[#FBF9FF] border-[#EEEAF5] opacity-75'
            : 'bg-white border-[#EEEAF5] hover:border-[#B6A2DB]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center shrink-0">
                {isMorningLocked ? <Lock className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#77619E] uppercase tracking-wider">
                    Manhã
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FBF9FF] text-[#817B89] border border-[#EEEAF5]">
                    {planConfig.morningCount} {planConfig.morningCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-editorial text-[#292532] mt-0.5">
                  {formatChapterRange(morningStart, planConfig.morningCount)}
                </h4>
                <p className="text-[11px] text-[#817B89]">
                  Capítulos {morningStart} a {morningEnd} da Bíblia
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleOpenPeriodReader(morningStart, planConfig.morningCount, 'morning', 'Manhã')}
                disabled={isMorningLocked}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ler na Bíblia</span>
              </button>
              <button
                onClick={() => handleTogglePeriod('morning')}
                disabled={isMorningLocked}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  periodStatus.morning
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-[#F5F0FF] text-[#817B89] border-[#EEEAF5]'
                }`}
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">{periodStatus.morning ? 'Lido' : 'Concluir'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. TARDE */}
        <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          periodStatus.afternoon
            ? 'bg-emerald-50/50 border-emerald-200'
            : isAfternoonLocked
            ? 'bg-[#FBF9FF] border-[#EEEAF5] opacity-75'
            : 'bg-white border-[#EEEAF5] hover:border-[#B6A2DB]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center shrink-0">
                {isAfternoonLocked ? <Lock className="w-4 h-4" /> : <Sunset className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#77619E] uppercase tracking-wider">
                    Tarde
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FBF9FF] text-[#817B89] border border-[#EEEAF5]">
                    {planConfig.afternoonCount} {planConfig.afternoonCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                  {isAfternoonLocked && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5F0FF] text-[#77619E]">
                      🔒 Aguarda Manhã
                    </span>
                  )}
                </div>
                <h4 className="text-base sm:text-lg font-editorial text-[#292532] mt-0.5">
                  {formatChapterRange(afternoonStart, planConfig.afternoonCount)}
                </h4>
                <p className="text-[11px] text-[#817B89]">
                  {isAfternoonLocked ? 'Libera ao concluir a Manhã' : `Capítulos ${afternoonStart} a ${afternoonEnd}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleOpenPeriodReader(afternoonStart, planConfig.afternoonCount, 'afternoon', 'Tarde')}
                disabled={isAfternoonLocked}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ler na Bíblia</span>
              </button>
              <button
                onClick={() => handleTogglePeriod('afternoon')}
                disabled={isAfternoonLocked}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  periodStatus.afternoon
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-[#F5F0FF] text-[#817B89] border-[#EEEAF5]'
                }`}
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">{periodStatus.afternoon ? 'Lido' : 'Concluir'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. NOITE */}
        <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          periodStatus.night
            ? 'bg-emerald-50/50 border-emerald-200'
            : isNightLocked
            ? 'bg-[#FBF9FF] border-[#EEEAF5] opacity-75'
            : 'bg-white border-[#EEEAF5] hover:border-[#B6A2DB]'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center shrink-0">
                {isNightLocked ? <Lock className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#77619E] uppercase tracking-wider">
                    Noite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FBF9FF] text-[#817B89] border border-[#EEEAF5]">
                    {planConfig.nightCount} {planConfig.nightCount === 1 ? 'capítulo' : 'capítulos'}
                  </span>
                  {isNightLocked && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5F0FF] text-[#77619E]">
                      🔒 Aguarda Tarde
                    </span>
                  )}
                </div>
                <h4 className="text-base sm:text-lg font-editorial text-[#292532] mt-0.5">
                  {formatChapterRange(nightStart, planConfig.nightCount)}
                </h4>
                <p className="text-[11px] text-[#817B89]">
                  {isNightLocked ? 'Libera ao concluir a Tarde' : `Capítulos ${nightStart} a ${nightEnd}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleOpenPeriodReader(nightStart, planConfig.nightCount, 'night', 'Noite')}
                disabled={isNightLocked}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#77619E] hover:bg-[#68538D] text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ler na Bíblia</span>
              </button>
              <button
                onClick={() => handleTogglePeriod('night')}
                disabled={isNightLocked}
                className={`p-2 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  periodStatus.night
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-[#F5F0FF] text-[#817B89] border-[#EEEAF5]'
                }`}
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">{periodStatus.night ? 'Lido' : 'Concluir'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Avançar para o dia seguinte */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <span className="text-xs font-semibold text-[#292532]">
            {isAllCompletedToday ? '✓ Todas as leituras de hoje foram concluídas!' : `${completedCount} de 3 etapas concluídas hoje`}
          </span>
          <p className="text-[11px] text-[#817B89] mt-0.5">
            Avançar levará os capítulos para a próxima sequência da jornada.
          </p>
        </div>
        <button
          onClick={handleAdvanceNextDay}
          className="px-4 py-2 rounded-xl bg-[#292532] hover:bg-black text-white font-medium text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Avançar para Próximo Dia</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Diário de anotações da Bíblia */}
      <div className="border border-[#EEEAF5] rounded-2xl p-5 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="font-medium text-xs text-[#292532] hover:text-[#77619E] flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#B6A2DB]" />
            <span>{showNotes ? 'Ocultar Anotações do Diário' : 'Escrever Anotações no Diário Bíblico'}</span>
          </button>
          {showNotes && (
            <button
              onClick={handleSaveNotes}
              className="text-xs font-medium text-[#77619E] hover:underline cursor-pointer"
            >
              Salvar Anotações
            </button>
          )}
        </div>

        {showNotes && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="text-[10px] font-semibold text-[#817B89] uppercase block mb-1">
                Anotação da Manhã:
              </label>
              <textarea
                rows={2}
                value={morningNote}
                onChange={e => setMorningNote(e.target.value)}
                placeholder="Versículo marcante da manhã..."
                className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-2.5 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#817B89] uppercase block mb-1">
                Anotação da Tarde:
              </label>
              <textarea
                rows={2}
                value={afternoonNote}
                onChange={e => setAfternoonNote(e.target.value)}
                placeholder="Reflexão da tarde..."
                className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-2.5 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#817B89] uppercase block mb-1">
                Anotação da Noite:
              </label>
              <textarea
                rows={2}
                value={nightNote}
                onChange={e => setNightNote(e.target.value)}
                placeholder="Oração e gratidão da noite..."
                className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-2.5 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
              />
            </div>
          </div>
        )}
      </div>
      {/* Modal para Trocar Bíblia */}
      {showBiblePickerModal && (
        <div
          id="modal-pick-bible-book"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg bg-white border border-[#EEEAF5] rounded-3xl p-6 shadow-2xl text-[#292532] space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-[#EEEAF5] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                  <Library className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-lg text-[#292532]">
                    Bíblia da Sua Biblioteca
                  </h3>
                  <p className="text-xs text-[#817B89]">
                    Escolha a tradução oficial ou sua Bíblia importada
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBiblePickerModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF]"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-[#FBF9FF] border border-[#EEEAF5] rounded-2xl flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#292532] block">Tem um PDF ou EPUB da Bíblia?</span>
                <span className="text-[11px] text-[#817B89]">Importe seu arquivo para o roteiro diário</span>
              </div>
              <label className="px-3.5 py-1.5 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{isImportingBible ? 'Importando...' : '+ Importar Bíblia'}</span>
                <input
                  type="file"
                  accept=".pdf,.epub,.txt,.cbz,.mobi"
                  disabled={isImportingBible}
                  className="hidden"
                  onChange={handleDirectImportBible}
                />
              </label>
            </div>

            <div className="overflow-y-auto space-y-2.5 flex-1 pr-1">
              <div
                onClick={handleSelectAlmeidaBible}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  useOfficialAlmeida
                    ? 'border-[#77619E] bg-[#F5F0FF]'
                    : 'border-[#EEEAF5] hover:bg-[#FBF9FF]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-14 rounded-xl bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-[#77619E]" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-[#292532] font-editorial">
                      Bíblia Sagrada – João Ferreira de Almeida
                    </h4>
                    <p className="text-[11px] text-[#817B89]">
                      Tradução clássica completa (66 livros)
                    </p>
                    <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white text-[#77619E] border border-[#EEEAF5] mt-1 inline-block">
                      TEXTO DIGITAL COMPLETO
                    </span>
                  </div>
                </div>
              </div>

              {libraryBooks.map(b => {
                const isCurrent = !useOfficialAlmeida && selectedBibleBook?.id === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => handleSelectLibraryBible(b)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-[#77619E] bg-[#F5F0FF]'
                        : 'border-[#EEEAF5] hover:bg-[#FBF9FF]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 rounded-xl overflow-hidden bg-[#FBF9FF] border border-[#EEEAF5] shrink-0">
                        {b.coverUrl ? (
                          <img src={b.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-[#77619E] font-medium">
                            {b.format.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-medium text-[#292532] truncate font-editorial">
                          {b.title}
                        </h4>
                        <p className="text-[11px] text-[#817B89] truncate">
                          {b.author || 'Importado pelo usuário'}
                        </p>
                        <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white text-[#77619E] border border-[#EEEAF5] mt-1 inline-block">
                          {b.format.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#EEEAF5] shrink-0">
              <button
                onClick={() => setShowBiblePickerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#817B89] hover:bg-[#F5F0FF] hover:text-[#292532]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Pular para Livro / Capítulo */}
      {showJumpModal && (
        <div
          id="modal-jump-bible-chapter"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white border border-[#EEEAF5] rounded-3xl p-6 shadow-2xl text-[#292532] space-y-4">
            <div className="flex justify-between items-center border-b border-[#EEEAF5] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-lg text-[#292532]">
                    Mudar Ponto de Início
                  </h3>
                  <p className="text-xs text-[#817B89]">
                    Defina de onde seu plano bíblico deve começar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowJumpModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#817B89] hover:text-[#292532]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#292532] block mb-1">
                  Livro da Bíblia:
                </label>
                <select
                  value={jumpBookId}
                  onChange={e => {
                    setJumpBookId(e.target.value);
                    setJumpChapter(1);
                  }}
                  className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-2.5 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
                >
                  <optgroup label="Antigo Testamento">
                    {BIBLE_BOOKS_CATALOG.filter(b => b.testament === 'old').map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.chaptersCount} caps)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Novo Testamento">
                    {BIBLE_BOOKS_CATALOG.filter(b => b.testament === 'new').map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.chaptersCount} caps)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                {(() => {
                  const selectedBookInfo =
                    BIBLE_BOOKS_CATALOG.find(b => b.id === jumpBookId) || BIBLE_BOOKS_CATALOG[0];
                  return (
                    <div>
                      <label className="text-xs font-medium text-[#292532] block mb-1">
                        Capítulo (1 a {selectedBookInfo.chaptersCount}):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={selectedBookInfo.chaptersCount}
                        value={jumpChapter}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setJumpChapter(Math.max(1, Math.min(selectedBookInfo.chaptersCount, val)));
                          }
                        }}
                        className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-2.5 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
                      />
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EEEAF5]">
              <button
                onClick={() => setShowJumpModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#817B89] hover:bg-[#F5F0FF] hover:text-[#292532]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmJump}
                className="px-5 py-2.5 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
              >
                Iniciar Aqui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 bg-stone-900 text-white text-xs font-semibold rounded-2xl shadow-2xl flex items-center gap-2 border border-stone-700 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
          <span className="text-emerald-400">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
