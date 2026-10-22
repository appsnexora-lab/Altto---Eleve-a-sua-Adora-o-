'use client';

import React, { useState, useEffect } from 'react';
import {
  BookMarked,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Edit3,
  Target,
  ArrowRight,
  Library,
  Check,
  X,
} from 'lucide-react';
import { Book } from '@/types';
import { getBooks } from '@/lib/bookService';
import { dbPut } from '@/lib/indexedDB';
import { getReadingProgress } from '@/lib/readerService';

interface DevotionalViewProps {
  onOpenReader: (params: {
    contentType: 'book' | 'devotional';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData?: Book;
    initialChapterOrDay?: number;
    devotionalDays?: any[];
    isDevotional?: boolean;
    isReadAlready?: boolean;
  }) => void;
  selectedDateStr?: string;
  onDateChange?: (date: string) => void;
}

interface DevotionalReflectionItem {
  id: string;
  date: string;
  bookId: string;
  bookTitle: string;
  text: string;
  createdAt: string;
}

export const DevotionalView: React.FC<DevotionalViewProps> = ({
  onOpenReader,
  selectedDateStr,
  onDateChange: _onDateChange,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeDate = selectedDateStr || todayStr;

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Completed dates for daily habit tracking
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [showBookPickerModal, setShowBookPickerModal] = useState<boolean>(false);
  const [reflectionText, setReflectionText] = useState<string>('');
  const [reflections, setReflections] = useState<DevotionalReflectionItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Load books & preferences
  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      try {
        const allBooks = await getBooks();
        if (isCancelled) return;
        setBooks(allBooks);

        // Load saved devotional book id from localStorage
        const savedBookId = localStorage.getItem('altto_devotional_book_id');
        let currentBook: Book | null = null;
        if (savedBookId) {
          currentBook = allBooks.find(b => b.id === savedBookId) || null;
        }

        // Fallback: pick book with "devocional", "cristo" or first book
        if (!currentBook && allBooks.length > 0) {
          const candidate = allBooks.find(
            b =>
              b.title.toLowerCase().includes('devocional') ||
              b.title.toLowerCase().includes('cristo') ||
              b.title.toLowerCase().includes('deus')
          );
          currentBook = candidate || allBooks[0];
          if (currentBook) {
            localStorage.setItem('altto_devotional_book_id', currentBook.id);
          }
        }

        setSelectedBook(currentBook);

        if (currentBook) {
          const prog = await getReadingProgress(currentBook.id);
          if (prog && !isCancelled) {
            setProgressPct(prog.percentage);
          } else if (currentBook.progressPercent !== undefined) {
            setProgressPct(currentBook.progressPercent);
          }
        }

        // Load completed dates
        const savedDates = localStorage.getItem('altto_devotional_completed_dates');
        if (savedDates) {
          try {
            setCompletedDates(JSON.parse(savedDates));
          } catch {}
        }

        // Load reflections
        const savedReflections = localStorage.getItem('altto_devotional_reflections_history');
        if (savedReflections) {
          try {
            setReflections(JSON.parse(savedReflections));
          } catch {}
        }
      } catch (err) {
        console.warn('Error loading devotional data:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    const handleDevotionalSync = () => {
      const savedDates = localStorage.getItem('altto_devotional_completed_dates');
      if (savedDates) {
        try {
          setCompletedDates(JSON.parse(savedDates));
        } catch {}
      }
    };

    window.addEventListener('altto_devotional_status_updated', handleDevotionalSync);
    loadData();
    return () => {
      isCancelled = true;
      window.removeEventListener('altto_devotional_status_updated', handleDevotionalSync);
    };
  }, []);

  const handleSelectBook = (book: Book) => {
    setSelectedBook(book);
    localStorage.setItem('altto_devotional_book_id', book.id);
    const curLastRead = localStorage.getItem('altto_last_read_book_id');
    if (curLastRead === book.id) {
      localStorage.removeItem('altto_last_read_book_id');
    }
    window.dispatchEvent(new CustomEvent('altto_devotional_book_changed', { detail: { bookId: book.id } }));
    window.dispatchEvent(new CustomEvent('altto_last_read_book_updated', { detail: { bookId: '' } }));
    setShowBookPickerModal(false);
    showToast(`Livro devocional alterado para "${book.title}"`);
    getReadingProgress(book.id).then(prog => {
      if (prog) setProgressPct(prog.percentage);
      else setProgressPct(book.progressPercent || 0);
    });
  };

  const handleToggleTodayCompleted = () => {
    let updated: string[];
    const isCompleted = completedDates.includes(activeDate);
    if (isCompleted) {
      updated = completedDates.filter(d => d !== activeDate);
      showToast('Leitura de hoje desmarcada');
    } else {
      updated = [...completedDates, activeDate];
      showToast('✓ Leitura devocional de hoje concluída!');
    }
    setCompletedDates(updated);
    localStorage.setItem('altto_devotional_completed_dates', JSON.stringify(updated));
    window.dispatchEvent(new Event('altto_devotional_status_updated'));
  };

  const handleSaveReflection = async () => {
    if (!reflectionText.trim() || !selectedBook) return;
    const newRef: DevotionalReflectionItem = {
      id: `dev-ref-${Date.now()}`,
      date: activeDate,
      bookId: selectedBook.id,
      bookTitle: selectedBook.title,
      text: reflectionText.trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = [newRef, ...reflections];
    setReflections(updated);
    localStorage.setItem('altto_devotional_reflections_history', JSON.stringify(updated));

    // Also persist in indexedDB for general backup
    try {
      await dbPut('bible_reflections', {
        id: newRef.id,
        bibleId: 'devotional',
        bookName: `Devocional: ${selectedBook.title}`,
        chapterNumber: 1,
        date: new Date().toISOString().split('T')[0],
        period: 'morning',
        text: newRef.text,
        createdAt: newRef.createdAt,
        userId: 'local-user',
      });
    } catch (e) {
      console.warn('Could not save to indexedDB:', e);
    }

    setReflectionText('');
    showToast('✓ Reflexão registrada no seu diário!');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Streak calculation
  const calculateStreak = (): number => {
    if (completedDates.length === 0) return 0;
    let streak = 0;
    const checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const dStr = checkDate.toISOString().split('T')[0];
      if (completedDates.includes(dStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (streak === 0 && dStr === todayStr) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterdayStr = checkDate.toISOString().split('T')[0];
          if (completedDates.includes(yesterdayStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }
    return streak;
  };

  const streak = calculateStreak();
  const isReadToday = completedDates.includes(activeDate);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-[#817B89] gap-3">
        <div className="w-8 h-8 border-2 border-[#77619E] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando livro devocional...</span>
      </div>
    );
  }

  return (
    <div id="devotional-view-container" className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 text-[#292532] bg-[#FFFFFF] min-h-screen overflow-x-hidden w-full">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-5 flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#77619E]">
              Momento Devocional
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-normal font-editorial tracking-tight text-[#292532]">
            Meu Momento com Deus
          </h1>
          <p className="text-xs sm:text-sm text-[#817B89]">
            Acompanhe a leitura diária do seu livro devocional e registre suas orações e reflexões.
          </p>
        </div>

        <button
          onClick={() => setShowBookPickerModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#FBF9FF] hover:bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] transition-colors cursor-pointer"
        >
          <Library className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>{selectedBook ? 'Trocar Livro' : 'Escolher Livro'}</span>
        </button>
      </div>

      {/* Hero: Meu Livro Devocional Selecionado */}
      {selectedBook ? (
        <div className="bg-[#FFFFFF] border border-[#EEEAF5] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between text-xs font-medium text-[#77619E] border-b border-[#EEEAF5] pb-3">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-semibold">
              <BookMarked className="w-3.5 h-3.5 text-[#B6A2DB]" />
              Livro Devocional Selecionado
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#F5F0FF] text-[#77619E] font-medium text-[10px] border border-[#EEEAF5]">
              {selectedBook.format.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Capa do Livro (Proporção 2:3) */}
            <div
              onClick={() =>
                onOpenReader({
                  contentType: 'book',
                  contentId: selectedBook.id,
                  title: selectedBook.title,
                  subtitle: selectedBook.author,
                  bookData: selectedBook,
                  isDevotional: true,
                })
              }
              className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden bg-[#FBF9FF] border border-[#EEEAF5] shadow-xs shrink-0 cursor-pointer group hover:border-[#B6A2DB] transition-all"
            >
              {selectedBook.coverUrl ? (
                <img
                  src={selectedBook.coverUrl}
                  alt={selectedBook.title}
                  className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#F5F0FF] text-[#77619E]">
                  <BookOpen className="w-6 h-6 mb-1 opacity-60" />
                  <span className="text-[9px] font-editorial line-clamp-2">
                    {selectedBook.title}
                  </span>
                </div>
              )}
            </div>

            {/* Detalhes do Livro e Ação */}
            <div className="flex-1 space-y-2.5 text-center sm:text-left min-w-0">
              <div>
                <h2 className="text-base sm:text-lg font-normal font-editorial text-[#292532] leading-snug">
                  {selectedBook.title}
                </h2>
                <p className="text-xs text-[#817B89] mt-0.5 font-medium">
                  {selectedBook.author || 'Autor não informado'}
                </p>
                {selectedBook.description && (
                  <p className="text-xs text-[#817B89] mt-2 line-clamp-2 leading-relaxed">
                    {selectedBook.description}
                  </p>
                )}
              </div>

              {/* Barra de Progresso Real */}
              <div className="space-y-1.5 max-w-md">
                <div className="flex justify-between text-xs text-[#817B89]">
                  <span>Progresso Geral de Leitura</span>
                  <span className="text-[#77619E] font-medium">{Math.round(progressPct)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#EEEAF5] overflow-hidden">
                  <div
                    className="h-full bg-[#77619E] rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(4, Math.min(100, progressPct))}%` }}
                  />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-2 flex flex-wrap gap-2.5 items-center justify-center sm:justify-start">
                <button
                  id="btn-open-devotional-book"
                  onClick={() =>
                    onOpenReader({
                      contentType: 'book',
                      contentId: selectedBook.id,
                      title: selectedBook.title,
                      subtitle: selectedBook.author,
                      bookData: selectedBook,
                      isDevotional: true,
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-[#77619E] text-white font-medium text-xs hover:bg-[#68538D] transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Continuar Leitura de Hoje</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowBookPickerModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#FBF9FF] hover:bg-[#F5F0FF] text-[#77619E] text-xs font-medium border border-[#EEEAF5] transition-colors cursor-pointer"
                >
                  Trocar Livro
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center mx-auto">
            <BookMarked className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-editorial text-xl text-[#292532]">Nenhum livro devocional selecionado</h3>
            <p className="text-xs text-[#817B89] mt-1 max-w-md mx-auto leading-relaxed">
              Escolha um livro da sua biblioteca para acompanhar sua leitura espiritual diária.
            </p>
          </div>
          <button
            onClick={() => setShowBookPickerModal(true)}
            className="px-4 py-2 rounded-xl bg-[#77619E] text-white font-medium text-xs hover:bg-[#68538D] transition-colors cursor-pointer"
          >
            Escolher da Biblioteca
          </button>
        </div>
      )}

      {/* Tracker de Leitura Diária & Hábitos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Card: Leitura de Hoje */}
        <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[#817B89]">
            <span className="flex items-center gap-1.5 font-medium text-[#292532]">
              <Calendar className="w-3.5 h-3.5 text-[#B6A2DB]" />
              Leitura de Hoje
            </span>
            <span className="text-[10px] text-[#A09AA8]">{activeDate}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs font-medium ${isReadToday ? 'text-emerald-700' : 'text-[#77619E]'}`}>
              {isReadToday ? '✓ Concluída hoje' : 'Pendente para hoje'}
            </span>
            <button
              id="btn-toggle-devotional-today"
              onClick={handleToggleTodayCompleted}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isReadToday
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-[#FBF9FF] text-[#817B89] border-[#EEEAF5] hover:text-[#292532] hover:bg-[#F5F0FF]'
              }`}
            >
              {isReadToday ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Check className="w-3.5 h-3.5 text-[#B6A2DB]" />}
              <span>{isReadToday ? 'Concluído' : 'Marcar lido'}</span>
            </button>
          </div>
        </div>

        {/* Card: Sequência de Dias (Streak) */}
        <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[#817B89]">
            <span className="flex items-center gap-1.5 font-medium text-[#292532]">
              <Flame className="w-3.5 h-3.5 text-[#77619E]" />
              Constância Diária
            </span>
            <span className="text-[10px] text-[#A09AA8]">Hábito</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-2xl font-editorial text-[#77619E]">{streak}</span>
            <span className="text-xs text-[#817B89] leading-tight">
              {streak === 1 ? 'dia consecutivo' : 'dias consecutivos de leitura'}
            </span>
          </div>
        </div>

        {/* Card: Meta Diária Sugerida */}
        <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-[#817B89]">
            <span className="flex items-center gap-1.5 font-medium text-[#292532]">
              <Target className="w-3.5 h-3.5 text-[#B6A2DB]" />
              Ritmo de Leitura
            </span>
            <span className="text-[10px] text-[#A09AA8]">Meta</span>
          </div>
          <p className="text-xs text-[#817B89] leading-relaxed pt-1">
            Recomendado: <strong>1 capítulo ou 5 a 10 páginas</strong> por dia no seu livro devocional.
          </p>
        </div>
      </div>

      {/* Diário de Reflexão & Oração */}
      <div className="bg-white border border-[#EEEAF5] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
          <h3 className="font-editorial text-lg text-[#292532] flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#B6A2DB]" />
            <span>Reflexão & Oração do Dia</span>
          </h3>
          <span className="text-xs text-[#817B89]">{activeDate}</span>
        </div>
        <p className="text-xs text-[#817B89]">
          O que Deus ministrou ao seu coração através da leitura do livro devocional hoje?
        </p>
        <textarea
          id="input-devotional-reflection"
          rows={3}
          value={reflectionText}
          onChange={e => setReflectionText(e.target.value)}
          placeholder="Escreva aqui seus aprendizados, orações ou versículos marcantes..."
          className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl p-3 text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB] leading-relaxed placeholder:text-[#A09AA8] resize-y"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSaveReflection}
            disabled={!reflectionText.trim()}
            className="px-4 py-2 rounded-xl bg-[#77619E] text-white font-medium text-xs hover:bg-[#68538D] disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
          >
            Salvar Reflexão de Hoje
          </button>
        </div>

        {/* Histórico de Reflexões Anteriores */}
        {reflections.length > 0 && (
          <div className="pt-4 border-t border-[#EEEAF5] space-y-2.5">
            <span className="text-[11px] font-semibold text-[#817B89] uppercase tracking-wider block">
              Reflexões registradas ({reflections.length}):
            </span>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {reflections.map(ref => (
                <div
                  key={ref.id}
                  className="p-3.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-xs space-y-1"
                >
                  <div className="flex justify-between text-[10px] text-[#817B89]">
                    <span className="font-semibold text-[#292532] font-editorial">{ref.bookTitle}</span>
                    <span>{ref.date}</span>
                  </div>
                  <p className="text-[#292532] leading-relaxed italic">&ldquo;{ref.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal para Escolher Livro da Biblioteca */}
      {showBookPickerModal && (
        <div
          id="modal-pick-devotional-book"
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
                    Escolher Livro Devocional
                  </h3>
                  <p className="text-xs text-[#817B89]">
                    Selecione um livro da sua biblioteca para sua leitura diária
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBookPickerModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#817B89] hover:text-[#292532] hover:bg-[#F5F0FF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {books.length === 0 ? (
                <div className="py-10 text-center text-[#817B89] text-xs space-y-2">
                  <p>Sua biblioteca ainda não tem livros cadastrados.</p>
                  <p className="text-[11px]">Importe arquivos PDF ou EPUB na aba Biblioteca.</p>
                </div>
              ) : (
                books.map(b => {
                  const isCurrent = selectedBook?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleSelectBook(b)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
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
                            <BookOpen className="w-4 h-4 m-auto text-[#77619E]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-[#292532] truncate font-editorial">
                            {b.title}
                          </h4>
                          <p className="text-[11px] text-[#817B89] truncate">
                            {b.author || 'Autor desconhecido'}
                          </p>
                          <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white text-[#77619E] border border-[#EEEAF5] mt-1 inline-block">
                            {b.format.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="text-xs text-[#77619E] font-medium shrink-0 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Ativo</span>
                        </span>
                      ) : (
                        <button className="text-xs text-[#77619E] hover:underline font-medium shrink-0">
                          Selecionar
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#EEEAF5] shrink-0">
              <button
                onClick={() => setShowBookPickerModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#817B89] hover:bg-[#F5F0FF] hover:text-[#292532]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#292532] text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-[#77619E]/30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
