'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  LayoutGrid,
  Columns4,
  Grid3X3,
  Image as ImageIcon,
  List,
  UploadCloud,
  RefreshCw,
  Star,
  BookOpen,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  Target,
  MoreVertical,
  Plus,
  Loader2,
  FileText,
  AlertCircle,
  ArrowUpDown,
  Bookmark,
  Calendar,
  RotateCcw,
  FileCheck,
  Folder,
  HelpCircle,
  Smartphone,
  Share2,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import JSZip from 'jszip';
import { Book, ReadingList, ReadingListItem, ReadingGoal, BookFormat } from '@/types';
import {
  getBooks,
  importMultipleBooks,
  updateBook,
  deleteBook,
  deleteMultipleBooks,
  repairBookCover,
  repairAllLibraryBooks,
  setBookCoverFromPdfPage,
  setBookCustomCover,
  getReadingLists,
  getReadingListItems,
  addBookToReadingList,
  removeBookFromReadingList,
  getReadingGoal,
  saveReadingGoal,
  BatchItemReport,
  MultiImportProgress,
} from '@/lib/bookService';
import { getReadingProgress } from '@/lib/readerService';
import { optimizeCoverThumbnail } from '@/lib/coverService';
import { deleteBookFromCloud } from '@/lib/firebaseSyncService';

interface LibraryViewProps {
  onOpenReader: (params: {
    contentType: 'book';
    contentId: string;
    title: string;
    subtitle?: string;
    bookData: Book;
  }) => void;
}

type FilterCategory =
  | 'all'
  | 'in_progress'
  | 'not_started'
  | 'completed'
  | 'favorites'
  | 'reading_list'
  | 'pdf'
  | 'epub';

type SortOption = 'recent' | 'title' | 'author' | 'progress';

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return 'Tamanho desconhecido';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenReader }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [readingListItems, setReadingListItems] = useState<ReadingListItem[]>([]);
  const [readingList, setReadingList] = useState<ReadingList | null>(null);
  const [goalsMap, setGoalsMap] = useState<Record<string, ReadingGoal>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Search, Filters & View Mode (Default: grid-4 = Fileiras de 4 Livros)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<'grid-4' | 'grid-compact' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('altto_library_grid_mode');
      if (saved === 'grid-4' || saved === 'grid-compact' || saved === 'list') {
        return saved;
      }
    }
    return 'grid-4';
  });

  const handleSetViewMode = (mode: 'grid-4' | 'grid-compact' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('altto_library_grid_mode', mode);
    } catch {}
  };

  const customCoverInputRef = useRef<HTMLInputElement>(null);

  // Selected Book for Editorial Details Modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  // Selected Book for Goal Modal
  const [goalModalBook, setGoalModalBook] = useState<Book | null>(null);
  const [targetDays, setTargetDays] = useState<number>(30);

  // Multi-File Batch Import
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importQueue, setImportQueue] = useState<BatchItemReport[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string>('');
  const [importCompletedSummary, setImportCompletedSummary] = useState<{
    total: number;
    success: number;
    failed: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const cancelImportRef = useRef<boolean>(false);
  const [showPwaInstallModal, setShowPwaInstallModal] = useState<boolean>(false);
  const [showMobileTips, setShowMobileTips] = useState<boolean>(false);

  // Batch Cover Repair & Auto-Detection
  const [showRepairModal, setShowRepairModal] = useState<boolean>(false);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [missingCoversCount, setMissingCoversCount] = useState<number>(0);
  const [isAutoRepairing, setIsAutoRepairing] = useState<boolean>(false);
  const [pdfPagePickerBook, setPdfPagePickerBook] = useState<Book | null>(null);
  const [pdfPagePickerPage, setPdfPagePickerPage] = useState<number>(1);
  const [isSettingPdfCover, setIsSettingPdfCover] = useState<boolean>(false);

  // Batch Selection & Multi-Delete
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // Single Book Delete Confirmation Modal
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isDeletingBook, setIsDeletingBook] = useState<boolean>(false);

  const [repairProgress, setRepairProgress] = useState<{
    current: number;
    total: number;
    currentTitle: string;
    repairedCount: number;
    failedCount: number;
  } | null>(null);
  const [repairResult, setRepairResult] = useState<{
    total: number;
    repaired: number;
    failed: number;
    skipped: number;
  } | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string>('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Visible items count for progressive loading
  const [visibleCount, setVisibleCount] = useState<number>(48);

  const runAutoRepair = async (booksToFix: Book[]) => {
    if (booksToFix.length === 0) return;
    setIsAutoRepairing(true);
    let recoveredCount = 0;

    for (const b of booksToFix) {
      try {
        const res = await repairBookCover(b);
        if (res.success) {
          recoveredCount++;
          setBooks((prev) => prev.map((item) => (item.id === b.id ? res.book : item)));
          if (selectedBook && selectedBook.id === b.id) {
            setSelectedBook(res.book);
          }
        }
      } catch (err) {
        console.warn('Auto-repair failed for book:', b.title, err);
      }
      setMissingCoversCount((prev) => Math.max(0, prev - 1));
      await new Promise((r) => setTimeout(r, 60));
    }

    setIsAutoRepairing(false);
    if (recoveredCount > 0) {
      showToast(`✓ ${recoveredCount} capa(s) original(is) restaurada(s) automaticamente!`);
    }
  };

  const loadData = async () => {
    try {
      const bookList = await getBooks();
      setBooks(bookList);

      // Check how many books lack their original cover
      const toFix = bookList.filter(
        (b) => !b.coverUrl || b.coverSource === 'fallback' || b.coverStatus === 'missing' || b.coverStatus === 'error'
      );
      setMissingCoversCount(toFix.length);

      // Automatically launch background repair for existing books without covers
      if (toFix.length > 0) {
        runAutoRepair(toFix);
      }

      const lists = await getReadingLists();
      if (lists.length > 0) {
        setReadingList(lists[0]);
        const items = await getReadingListItems(lists[0].id);
        setReadingListItems(items);
      }

      const gMap: Record<string, ReadingGoal> = {};
      const pMap: Record<string, number> = {};
      for (const b of bookList) {
        const g = await getReadingGoal(b.id);
        if (g) gMap[b.id] = g;
        const p = await getReadingProgress(b.id);
        if (p) pMap[b.id] = p.percentage;
      }
      setGoalsMap(gMap);
      setProgressMap(pMap);
    } catch (err) {
      console.warn('Erro ao carregar dados da biblioteca:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter & Sort Logic
  const filteredAndSortedBooks = useMemo(() => {
    let result = [...books];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.description && b.description.toLowerCase().includes(q))
      );
    }

    // Category filter
    switch (activeCategory) {
      case 'in_progress':
        result = result.filter(
          (b) => b.status === 'in_progress' || ((progressMap[b.id] ?? 0) > 0 && (progressMap[b.id] ?? 0) < 100)
        );
        break;
      case 'not_started':
        result = result.filter(
          (b) => b.status === 'not_started' && (progressMap[b.id] ?? 0) === 0
        );
        break;
      case 'completed':
        result = result.filter(
          (b) => b.status === 'completed' || (progressMap[b.id] ?? 0) === 100
        );
        break;
      case 'favorites':
        result = result.filter((b) => b.isFavorite);
        break;
      case 'reading_list': {
        const bookIdsInList = new Set(readingListItems.map((i) => i.bookId));
        result = result.filter((b) => bookIdsInList.has(b.id));
        break;
      }
      case 'pdf':
        result = result.filter((b) => b.format === 'pdf');
        break;
      case 'epub':
        result = result.filter((b) => b.format === 'epub');
        break;
      case 'all':
      default:
        break;
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title, 'pt-BR');
        case 'author':
          return (a.author || '').localeCompare(b.author || '', 'pt-BR');
        case 'progress': {
          const pA = progressMap[a.id] ?? a.progressPercent ?? 0;
          const pB = progressMap[b.id] ?? b.progressPercent ?? 0;
          return pB - pA;
        }
        case 'recent':
        default:
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
    });

    return result;
  }, [books, searchQuery, activeCategory, sortBy, progressMap, readingListItems]);

  // Actions
  const handleToggleFavorite = async (book: Book, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = { ...book, isFavorite: !book.isFavorite };
    await updateBook(updated);
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    if (selectedBook && selectedBook.id === book.id) {
      setSelectedBook(updated);
    }
    showToast(updated.isFavorite ? '★ Adicionado aos favoritos' : 'Removido dos favoritos');
  };

  const handleToggleReadingList = async (book: Book, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!readingList) return;
    const exists = readingListItems.some((i) => i.bookId === book.id);
    if (exists) {
      const item = readingListItems.find((i) => i.bookId === book.id);
      if (item) {
        await removeBookFromReadingList(item.id);
        const updated = await getReadingListItems(readingList.id);
        setReadingListItems(updated);
        showToast('Removido da lista Quero Ler');
      }
    } else {
      await addBookToReadingList(readingList.id, book.id);
      const updated = await getReadingListItems(readingList.id);
      setReadingListItems(updated);
      showToast('✓ Adicionado à lista Quero Ler');
    }
  };

  const handleRepairSingleCover = async (book: Book) => {
    showToast(`Verificando capa de "${book.title}"...`);
    const res = await repairBookCover(book);
    if (res.success) {
      setBooks((prev) => prev.map((b) => (b.id === book.id ? res.book : b)));
      if (selectedBook && selectedBook.id === book.id) {
        setSelectedBook(res.book);
      }
      setMissingCoversCount((prev) => Math.max(0, prev - 1));
      showToast('✓ Capa original recuperada com sucesso!');
    } else {
      showToast(res.reason || 'Não foi possível recuperar a capa deste arquivo.');
    }
  };

  const handleApplyPdfPageCover = async () => {
    if (!pdfPagePickerBook) return;
    setIsSettingPdfCover(true);
    showToast(`Extraindo página ${pdfPagePickerPage} como nova capa...`);
    const res = await setBookCoverFromPdfPage(pdfPagePickerBook, pdfPagePickerPage);
    setIsSettingPdfCover(false);
    if (res.success) {
      setBooks((prev) => prev.map((b) => (b.id === res.book.id ? res.book : b)));
      if (selectedBook && selectedBook.id === res.book.id) {
        setSelectedBook(res.book);
      }
      setPdfPagePickerBook(null);
      setMissingCoversCount((prev) => Math.max(0, prev - 1));
      showToast(`✓ Página ${pdfPagePickerPage} definida como capa oficial com sucesso!`);
    } else {
      showToast(res.reason || 'Falha ao extrair página como capa.');
    }
  };

  const handleCustomCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBook) return;

    try {
      showToast('Otimizando e aplicando nova capa...');
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawDataUrl = reader.result as string;
          const optimized = await optimizeCoverThumbnail(rawDataUrl, 640, 960);

          const updated: Book = {
            ...selectedBook,
            coverUrl: optimized,
            coverType: 'image/jpeg',
            coverSource: 'manual',
            coverStatus: 'custom',
            coverGeneratedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await updateBook(updated);
          setSelectedBook(updated);
          setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          showToast('✓ Capa personalizada salva com sucesso!');
        } catch (err) {
          console.error(err);
          showToast('Erro ao processar imagem da capa.');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar capa personalizada.');
    } finally {
      if (customCoverInputRef.current) {
        customCoverInputRef.current.value = '';
      }
    }
  };

  const handleDeleteBook = (book: Book) => {
    setBookToDelete(book);
  };

  const handleExecuteDelete = async () => {
    if (!bookToDelete) return;
    setIsDeletingBook(true);
    const bookTitle = bookToDelete.title.replace(/_/g, ' ');
    const id = bookToDelete.id;
    try {
      await deleteBook(id);
      deleteBookFromCloud(id).catch(() => {});
      setBooks((prev) => prev.filter((b) => b.id !== id));
      if (selectedBook?.id === id) {
        setSelectedBook(null);
      }
      showToast(`✓ Livro "${bookTitle}" excluído com sucesso.`);
      setBookToDelete(null);
    } catch (err) {
      console.error('Erro ao excluir livro:', err);
      showToast('Erro ao excluir livro da biblioteca.');
    } finally {
      setIsDeletingBook(false);
    }
  };

  const toggleSelectBook = (bookId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const visibleBooks = filteredAndSortedBooks.slice(0, visibleCount);
    if (selectedBookIds.size === visibleBooks.length) {
      setSelectedBookIds(new Set());
    } else {
      setSelectedBookIds(new Set(visibleBooks.map((b) => b.id)));
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedBookIds(new Set());
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedBookIds.size === 0) return;
    setIsDeletingBatch(true);
    const count = selectedBookIds.size;
    try {
      const idsToDelete = Array.from(selectedBookIds);
      await deleteMultipleBooks(idsToDelete);
      setBooks((prev) => prev.filter((b) => !selectedBookIds.has(b.id)));
      if (selectedBook && selectedBookIds.has(selectedBook.id)) {
        setSelectedBook(null);
      }
      setSelectedBookIds(new Set());
      setIsSelectionMode(false);
      setShowBatchDeleteModal(false);
      showToast(`✓ ${count} livro${count > 1 ? 's excluídos' : ' excluído'} com sucesso!`);
    } catch (err) {
      console.error('Falha ao excluir livros:', err);
      showToast('Erro ao excluir livros selecionados.');
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Add files to queue (supports individual files and .zip packs with multiple books)
  const addFilesToQueue = async (files: File[]) => {
    if (!files || files.length === 0) return;

    const validExtensions = ['pdf', 'epub', 'mobi', 'cbz', 'cbr', 'txt'];
    const validMimes = ['application/pdf', 'application/epub+zip', 'text/plain'];

    const unpackedFiles: File[] = [];

    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.zip')) {
        showToast(`Extraindo livros de "${f.name}"...`);
        try {
          const zip = await JSZip.loadAsync(f);
          let countInZip = 0;
          for (const [relativePath, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const ext = relativePath.split('.').pop()?.toLowerCase() || '';
            if (validExtensions.includes(ext)) {
              const blob = await entry.async('blob');
              const cleanFileName = relativePath.split('/').pop() || relativePath;
              const mime = ext === 'pdf' ? 'application/pdf' : ext === 'epub' ? 'application/epub+zip' : blob.type;
              unpackedFiles.push(new File([blob], cleanFileName, { type: mime }));
              countInZip++;
            }
          }
          if (countInZip > 0) {
            showToast(`✓ ${countInZip} livro(s) extraído(s) do arquivo ZIP!`);
          } else {
            showToast(`Nenhum livro PDF ou EPUB encontrado dentro de "${f.name}".`);
          }
        } catch (zipErr) {
          console.warn('Erro ao descompactar ZIP:', zipErr);
          showToast(`Não foi possível abrir o arquivo ZIP "${f.name}".`);
        }
      } else {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (validExtensions.includes(ext) || validMimes.includes(f.type)) {
          unpackedFiles.push(f);
        }
      }
    }

    if (unpackedFiles.length === 0) {
      showToast('Nenhum arquivo PDF, EPUB ou ZIP com livros encontrado.');
      return;
    }

    setImportQueue((prev) => {
      const existingKeys = new Set(prev.map((i) => `${i.fileName}_${i.fileSize}`));
      const toAdd: BatchItemReport[] = [];

      for (let idx = 0; idx < unpackedFiles.length; idx++) {
        const file = unpackedFiles[idx];
        const key = `${file.name}_${file.size}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          toAdd.push({
            id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            file,
            fileName: file.name,
            fileSize: file.size,
            status: 'pending',
          });
        }
      }

      if (toAdd.length === 0) {
        showToast('Os arquivos selecionados já estão na fila de importação.');
        return prev;
      }

      showToast(`${toAdd.length} arquivo(s) adicionado(s) à fila.`);
      return [...prev, ...toAdd];
    });

    setImportCompletedSummary(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // Reset input value so selecting the same file again triggers change event
      e.target.value = '';
      addFilesToQueue(files);
    }
  };

  const handleRemoveQueueItem = (id: string) => {
    if (isImporting) return;
    setImportQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearQueue = () => {
    if (isImporting) return;
    setImportQueue([]);
    setImportCompletedSummary(null);
    setCurrentProcessingFile('');
  };

  const handleCancelImport = () => {
    cancelImportRef.current = true;
    showToast('Interrompendo após o arquivo atual...');
  };

  // Run Batch Import on given items (or all pending/failed)
  const handleStartImport = async (targetItems?: BatchItemReport[]) => {
    const itemsToRun = targetItems || importQueue.filter((i) => i.status !== 'success');
    if (itemsToRun.length === 0) return;

    setIsImporting(true);
    cancelImportRef.current = false;
    setImportCompletedSummary(null);

    // Mark targeted items as pending in UI
    setImportQueue((prev) =>
      prev.map((i) =>
        itemsToRun.some((t) => t.id === i.id) ? { ...i, status: 'pending', errorMessage: undefined } : i
      )
    );

    const filesToImport = itemsToRun.map((i) => i.file);

    try {
      const result = await importMultipleBooks(
        filesToImport,
        undefined,
        () => cancelImportRef.current,
        (updatedReport) => {
          setCurrentProcessingFile(updatedReport.fileName);
          setImportQueue((prev) =>
            prev.map((item) => {
              if (item.fileName === updatedReport.fileName && item.fileSize === updatedReport.fileSize) {
                return {
                  ...item,
                  status: updatedReport.status,
                  errorMessage: updatedReport.errorMessage,
                  book: updatedReport.book,
                };
              }
              return item;
            })
          );
        }
      );

      // Refresh library database state
      await loadData();

      const finalSuccess = result.success.length;
      const finalErrors = result.errors.length;

      setImportCompletedSummary({
        total: filesToImport.length,
        success: finalSuccess,
        failed: finalErrors,
      });

      if (result.cancelled) {
        showToast(`Importação interrompida: ${finalSuccess} livros salvos com segurança.`);
      } else if (finalErrors === 0) {
        showToast(`✓ Sucesso! ${finalSuccess} livros importados para sua biblioteca.`);
      } else {
        showToast(`Concluído: ${finalSuccess} importados, ${finalErrors} falharam.`);
      }
    } catch (err: any) {
      console.error('Erro na importação em lote:', err);
      showToast('Erro inesperado durante a importação.');
    } finally {
      setIsImporting(false);
      setCurrentProcessingFile('');
    }
  };

  const handleRetryFailed = () => {
    const failedItems = importQueue.filter((i) => i.status === 'error');
    if (failedItems.length > 0) {
      handleStartImport(failedItems);
    }
  };

  // Batch Repair Execution
  const handleStartBatchRepair = async () => {
    setIsRepairing(true);
    setRepairResult(null);

    try {
      const res = await repairAllLibraryBooks((p) => {
        setRepairProgress(p);
      });
      setRepairResult(res);
      await loadData();
      showToast(`✓ Verificação finalizada! ${res.repaired} capas recuperadas.`);
    } catch (err) {
      console.error(err);
      showToast('Erro durante a verificação das capas.');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleSaveGoal = async () => {
    if (!goalModalBook) return;
    const goal = await saveReadingGoal(goalModalBook.id, targetDays, goalModalBook.totalPages || 100);
    setGoalsMap((prev) => ({ ...prev, [goalModalBook.id]: goal }));
    setGoalModalBook(null);
    showToast(`✓ Meta de ${targetDays} dias definida para "${goalModalBook.title}"`);
  };

  const categories: { id: FilterCategory; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'in_progress', label: 'Em andamento' },
    { id: 'not_started', label: 'Não iniciados' },
    { id: 'completed', label: 'Concluídos' },
    { id: 'favorites', label: 'Favoritos' },
    { id: 'reading_list', label: 'Quero Ler' },
    { id: 'pdf', label: 'PDF' },
    { id: 'epub', label: 'EPUB' },
  ];

  return (
    <div id="library-view-container" className="max-w-[1440px] mx-auto px-2 sm:px-4 py-4 space-y-4 overflow-x-hidden w-full">
      {/* 1. Header Editorial da Biblioteca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EEEAF5] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-editorial text-xl sm:text-2xl text-[#292532] font-normal tracking-tight">
              Minha Biblioteca
            </h1>
            <span className="text-[11px] text-[#817B89] bg-[#F5F0FF] text-[#77619E] px-2 py-0.5 rounded-full border border-[#EEEAF5] font-medium">
              {books.length} {books.length === 1 ? 'livro' : 'livros'}
            </span>
          </div>
          <p className="text-[11px] text-[#817B89] mt-0.5">
            4 livros por fileira com capas originais em alta fidelidade e sem cortes.
          </p>
        </div>

        {/* Action Buttons: Import, Select/Multi-Delete & Repair */}
        <div className="flex items-center gap-2 flex-wrap">
          {books.length > 0 && (
            <button
              onClick={() => {
                if (isSelectionMode) {
                  handleExitSelectionMode();
                } else {
                  setIsSelectionMode(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isSelectionMode
                  ? 'bg-[#77619E] text-white border-[#77619E] shadow-2xs'
                  : 'bg-[#FBF9FF] hover:bg-[#F5F0FF] border-[#EEEAF5] text-[#77619E]'
              }`}
              title="Selecionar vários livros para excluir ou gerenciar"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isSelectionMode ? 'Concluir' : 'Selecionar'}</span>
            </button>
          )}

          <button
            onClick={() => {
              if (missingCoversCount > 0) {
                const list = books.filter(
                  (b) => !b.coverUrl || b.coverSource === 'fallback' || b.coverStatus === 'missing' || b.coverStatus === 'error'
                );
                runAutoRepair(list);
              } else {
                setShowRepairModal(true);
              }
            }}
            disabled={isAutoRepairing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-xs font-medium text-[#77619E] transition-colors cursor-pointer disabled:opacity-50"
            title="Verificar e recuperar capas originais dos arquivos"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#B6A2DB] ${isAutoRepairing ? 'animate-spin' : ''}`} />
            <span>
              {isAutoRepairing
                ? 'Recuperando Capas...'
                : missingCoversCount > 0
                ? `Recuperar Capas (${missingCoversCount})`
                : 'Recuperar Capas'}
            </span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Importar Livros</span>
          </button>
        </div>
      </div>

      {/* Banner de Recuperação de Capas Originais */}
      {missingCoversCount > 0 && (
        <div className="bg-gradient-to-r from-[#FAF8FD] to-[#F5F0FF] border border-[#B6A2DB]/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#77619E] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#292532]">
                {isAutoRepairing
                  ? `Recuperando capas originais dos arquivos em segundo plano (${missingCoversCount} restante${missingCoversCount > 1 ? 's' : ''})...`
                  : `${missingCoversCount} livro${missingCoversCount > 1 ? 's' : ''} na biblioteca sem capa original extraída.`}
              </p>
              <p className="text-[11px] text-[#817B89]">
                Extração em alta fidelidade e sem cortes preservando a arte original de PDF e EPUB.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const list = books.filter(
                (b) => !b.coverUrl || b.coverSource === 'fallback' || b.coverStatus === 'missing' || b.coverStatus === 'error'
              );
              runAutoRepair(list);
            }}
            disabled={isAutoRepairing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAutoRepairing ? 'animate-spin' : ''}`} />
            <span>{isAutoRepairing ? 'Recuperando...' : 'Recuperar Todas as Capas Agora'}</span>
          </button>
        </div>
      )}

      {/* 2. Barra de Ferramentas Compacta & Filtros */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Campo de Busca Minimalista */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B6A2DB]" />
            <input
              type="text"
              placeholder="Buscar por título, autor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] focus:border-[#B6A2DB] focus:bg-white text-xs text-[#292532] transition-colors placeholder:text-[#A09AA8] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A09AA8] hover:text-[#292532]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Ordenação & Alternador Grade/Lista */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 bg-[#FBF9FF] px-2.5 py-1 rounded-xl border border-[#EEEAF5] text-xs text-[#817B89]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#B6A2DB]" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-[#292532] text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="recent">Mais Recentes</option>
                <option value="title">Título (A-Z)</option>
                <option value="author">Autor</option>
                <option value="progress">Progresso</option>
              </select>
            </div>

            <div className="flex items-center p-0.5 bg-[#FBF9FF] rounded-xl border border-[#EEEAF5] gap-0.5">
              <button
                onClick={() => handleSetViewMode('grid-4')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium ${
                  viewMode === 'grid-4'
                    ? 'bg-white text-[#77619E] shadow-2xs border border-[#EEEAF5]'
                    : 'text-[#817B89] hover:text-[#292532]'
                }`}
                title="4 Livros Lado a Lado"
              >
                <Columns4 className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">4 Livros</span>
              </button>
              <button
                onClick={() => handleSetViewMode('grid-compact')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium ${
                  viewMode === 'grid-compact'
                    ? 'bg-white text-[#77619E] shadow-2xs border border-[#EEEAF5]'
                    : 'text-[#817B89] hover:text-[#292532]'
                }`}
                title="Grade Compacta"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Compacto</span>
              </button>
              <button
                onClick={() => handleSetViewMode('list')}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-[#77619E] shadow-2xs border border-[#EEEAF5]'
                    : 'text-[#817B89] hover:text-[#292532]'
                }`}
                title="Visualização em Lista"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Abas de Categorias — 100% Compactas e sem rolagem lateral */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-xs">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer text-[11px] sm:text-xs ${
                  isActive
                    ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] font-semibold'
                    : 'bg-[#FBF9FF] text-[#817B89] border border-transparent hover:text-[#292532] hover:bg-[#F5F0FF]/50'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Conteúdo Principal da Biblioteca (Grade ou Lista) */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center text-[#817B89] space-y-3">
          <Loader2 className="w-7 h-7 text-[#77619E] animate-spin" />
          <p className="text-xs">Carregando sua biblioteca...</p>
        </div>
      ) : filteredAndSortedBooks.length === 0 ? (
        <div className="py-20 px-4 text-center rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F5F0FF] flex items-center justify-center text-[#77619E]">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-editorial text-xl text-[#292532]">Nenhum livro encontrado</h3>
            <p className="text-xs text-[#817B89] mt-1">
              {searchQuery
                ? `Nenhum resultado para "${searchQuery}". Tente outro termo.`
                : 'Sua estante nesta categoria está vazia. Adicione novos livros em PDF ou EPUB.'}
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Importar Livros Agora</span>
          </button>
        </div>
      ) : viewMode !== 'list' ? (
        /* GRADE: FILEIRAS DE 4 LIVROS OU GRADE COMPACTA COM PRESERVAÇÃO TOTAL DE CAPAS */
        <div className="space-y-6">
          <div className={viewMode === 'grid-4' ? 'library-grid-4' : 'library-grid-compact'}>
            {filteredAndSortedBooks.slice(0, visibleCount).map((book) => {
              const progress = progressMap[book.id] ?? book.progressPercent ?? 0;
              const hasStarted = progress > 0;
              const isGrid4 = viewMode === 'grid-4';
              const isSelected = selectedBookIds.has(book.id);

              return (
                <div
                  key={book.id}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleSelectBook(book.id);
                    } else {
                      setSelectedBook(book);
                    }
                  }}
                  className={`border flex flex-col justify-between cursor-pointer transition-all duration-200 group relative ${
                    isSelected
                      ? 'bg-[#F5F0FF]/40 border-[#77619E] ring-2 ring-[#77619E] shadow-[0_4px_16px_rgba(119,97,158,0.12)]'
                      : 'bg-white border-[#EEEAF5] hover:border-[#B6A2DB] hover:shadow-[0_8px_20px_rgba(119,97,158,0.08)]'
                  } p-1.5 sm:p-2.5 rounded-xl`}
                >
                  {/* Capa com Proporção 100% Preservada (Sem Cortes) */}
                  <div className="w-full aspect-[2/3] overflow-hidden bg-[#FAF8FD] border border-[#EEEAF5] relative flex items-center justify-center group-hover:border-[#B6A2DB] transition-all shadow-2xs rounded-lg mb-1.5">
                    {book.coverUrl ? (
                      <>
                        {/* 1. Fundo Desfocado Atmosférico da Capa */}
                        <img
                          src={book.coverUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-30 select-none pointer-events-none"
                        />

                        {/* 2. Capa Original Nítida 100% Preservada */}
                        <img
                          src={book.coverUrl}
                          alt={book.title}
                          loading="lazy"
                          className="relative z-10 w-full h-full object-contain p-0.5 group-hover:scale-[1.02] transition-transform duration-200 drop-shadow-xs"
                        />

                        {/* 3. Efeito de Lombada */}
                        <div className="absolute inset-y-0 left-0 w-2.5 sm:w-3 bg-gradient-to-r from-black/20 via-black/5 to-transparent z-20 pointer-events-none rounded-l-lg" />
                      </>
                    ) : (
                      <div className="w-full h-full p-2 flex flex-col items-center justify-center text-center bg-[#F5F0FF] text-[#77619E]">
                        <BookOpen className="w-6 h-6 mb-1 opacity-50" />
                        <span className="text-[9px] line-clamp-2 font-editorial leading-tight">
                          {book.title}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRepairSingleCover(book);
                          }}
                          className="mt-1 text-[9px] bg-white hover:bg-[#77619E] hover:text-white text-[#77619E] border border-[#EEEAF5] px-1.5 py-0.5 rounded flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Recuperar capa original"
                        >
                          <RefreshCw className="w-2 h-2" />
                          <span>Capa</span>
                        </button>
                      </div>
                    )}

                    {/* Tag de Formato Discreta */}
                    <span className="absolute top-1.5 left-1.5 z-30 font-bold uppercase tracking-wider bg-white/95 text-[#77619E] rounded shadow-2xs border border-[#EEEAF5] text-[8px] sm:text-[9px] px-1 py-0.2">
                      {book.format}
                    </span>

                    {/* Checkbox de Seleção ou Favorito */}
                    {isSelectionMode ? (
                      <button
                        onClick={(e) => toggleSelectBook(book.id, e)}
                        className={`absolute top-1.5 right-1.5 z-30 p-1 rounded shadow-2xs border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#77619E] border-[#77619E] text-white'
                            : 'bg-white/95 border-[#EEEAF5] text-[#817B89] hover:text-[#77619E]'
                        }`}
                        title={isSelected ? 'Desmarcar livro' : 'Selecionar livro'}
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      book.isFavorite && (
                        <span className="absolute top-1.5 right-1.5 z-30 text-amber-500 bg-white/95 p-0.5 rounded shadow-2xs border border-[#EEEAF5]">
                          <Star className="w-3 h-3 fill-amber-400" />
                        </span>
                      )
                    )}
                  </div>

                  {/* Informações Textuais Compactas */}
                  <div className="space-y-0.5 flex-1 flex flex-col justify-end">
                    <h3 className="font-editorial text-[#292532] group-hover:text-[#77619E] transition-colors line-clamp-2 text-xs sm:text-sm font-medium leading-tight break-words break-all">
                      {book.title.replace(/_/g, ' ')}
                    </h3>
                    <p className="text-[#817B89] truncate text-[9px] sm:text-[11px]">
                      {book.author || 'Autor desconhecido'}
                    </p>

                    {/* Barra de Progresso Compacta */}
                    {hasStarted && (
                      <div className="pt-1">
                        <div className="w-full h-1 bg-[#EEEAF5] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-linear-to-r from-[#77619E] to-[#9680BE] rounded-full"
                            style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
                          />
                        </div>
                        <div className="pt-0.5 flex items-center justify-between text-[9px] text-[#817B89]">
                          <span className="font-semibold text-[#77619E]">{Math.round(progress)}%</span>
                          {progress >= 100 ? (
                            <span className="text-emerald-600 font-semibold text-[8px] bg-emerald-50 px-1 rounded">
                              ✓
                            </span>
                          ) : book.totalPages ? (
                            <span className="text-[#A09AA8]">{book.totalPages}p</span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carregamento Progressivo */}
          {visibleCount < filteredAndSortedBooks.length && (
            <div className="text-center pt-4">
              <button
                onClick={() => setVisibleCount((prev) => prev + 48)}
                className="px-5 py-2 rounded-xl bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-xs font-medium text-[#77619E] transition-colors cursor-pointer"
              >
                Carregar mais livros ({filteredAndSortedBooks.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM LISTA EDITORIAL */
        <div className="bg-white border border-[#EEEAF5] rounded-2xl divide-y divide-[#EEEAF5] overflow-hidden">
          {filteredAndSortedBooks.slice(0, visibleCount).map((book) => {
            const progress = progressMap[book.id] ?? book.progressPercent ?? 0;
            const isSelected = selectedBookIds.has(book.id);
            return (
              <div
                key={book.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelectBook(book.id);
                  } else {
                    setSelectedBook(book);
                  }
                }}
                className={`p-3 sm:p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#F5F0FF]/60' : 'hover:bg-[#FDFCFF]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelectionMode && (
                    <button
                      onClick={(e) => toggleSelectBook(book.id, e)}
                      className={`p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#77619E] border-[#77619E] text-white'
                          : 'bg-white border-[#EEEAF5] text-[#817B89] hover:text-[#77619E]'
                      }`}
                      title={isSelected ? 'Desmarcar livro' : 'Selecionar livro'}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  )}
                  <div className="w-10 h-14 rounded overflow-hidden bg-[#FBF9FF] border border-[#EEEAF5] shrink-0">
                    {book.coverUrl ? (
                      <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="w-4 h-4 m-auto text-[#77619E]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-medium text-[#292532] truncate">
                        {book.title}
                      </h4>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] shrink-0">
                        {book.format}
                      </span>
                      {book.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-[#817B89] truncate">{book.author || 'Autor desconhecido'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <span className="text-xs text-[#292532] font-medium">{Math.round(progress)}%</span>
                    <span className="text-[10px] text-[#A09AA8] block">{formatFileSize(book.originalFileSize)}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReader({
                        contentType: 'book',
                        contentId: book.id,
                        title: book.title,
                        subtitle: book.author,
                        bookData: book,
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F5F0FF] hover:bg-[#77619E] hover:text-white text-[#77619E] text-xs font-medium transition-colors"
                  >
                    Ler
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODAL EDITORIAL DE DETALHES DO LIVRO SELECIONADO */}
      {selectedBook && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-lg sm:max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Top Bar with Close */}
            <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
              <span className="text-xs font-sans text-[#77619E] uppercase tracking-wider font-semibold">
                Detalhes da Obra
              </span>
              <button
                onClick={() => setSelectedBook(null)}
                className="text-[#817B89] hover:text-[#292532] p-1.5 rounded-lg hover:bg-[#F5F0FF] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Book Presentation */}
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start w-full min-w-0">
              {/* Cover com Preservação 100% Original */}
              <div className="w-28 sm:w-36 aspect-[2/3] shrink-0 mx-auto sm:mx-0 rounded-2xl overflow-hidden border border-[#EEEAF5] bg-[#FAF8FD] shadow-xs relative flex items-center justify-center group">
                {selectedBook.coverUrl ? (
                  <>
                    <img
                      src={selectedBook.coverUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-30 select-none pointer-events-none"
                    />
                    <img
                      src={selectedBook.coverUrl}
                      alt={selectedBook.title}
                      className="relative z-10 w-full h-full object-contain p-1 drop-shadow-sm"
                    />
                    <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/20 via-black/5 to-transparent z-20 pointer-events-none rounded-l-2xl" />
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[#F5F0FF] text-[#77619E]">
                    <BookOpen className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-xs font-editorial line-clamp-3 break-words break-all">
                      {selectedBook.title.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
                <span className="absolute top-2 left-2 z-30 text-[10px] font-semibold uppercase bg-white/95 text-[#77619E] px-2 py-0.5 rounded shadow-2xs border border-[#EEEAF5]">
                  {selectedBook.format}
                </span>
              </div>

              {/* Metadata */}
              <div className="flex-1 space-y-3 min-w-0 w-full overflow-hidden">
                <div className="w-full min-w-0">
                  <h2 className="font-editorial text-base sm:text-lg md:text-xl text-[#292532] font-medium leading-snug break-words break-all hyphens-auto overflow-hidden">
                    {selectedBook.title.replace(/_/g, ' ')}
                  </h2>
                  <p className="text-xs text-[#817B89] mt-1 font-medium break-words break-all">
                    {selectedBook.author || 'Autor desconhecido'}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-[#817B89]">
                    <span>Progresso de Leitura</span>
                    <span className="font-semibold text-[#292532]">
                      {Math.round(progressMap[selectedBook.id] ?? selectedBook.progressPercent ?? 0)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#EEEAF5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#77619E] rounded-full"
                      style={{
                        width: `${Math.max(
                          4,
                          Math.min(100, progressMap[selectedBook.id] ?? selectedBook.progressPercent ?? 0)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Technical Specs */}
                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-[#817B89]">
                  <div className="p-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5]">
                    <span className="block text-[10px] text-[#A09AA8]">Tamanho</span>
                    <span className="font-medium text-[#292532]">{formatFileSize(selectedBook.originalFileSize)}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5]">
                    <span className="block text-[10px] text-[#A09AA8]">Adicionado em</span>
                    <span className="font-medium text-[#292532]">
                      {new Date(selectedBook.addedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hidden Input for Custom Cover Upload */}
            <input
              ref={customCoverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCustomCoverChange}
            />

            {/* Primary & Secondary Actions */}
            <div className="space-y-3 pt-2 border-t border-[#EEEAF5]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const b = selectedBook;
                    setSelectedBook(null);
                    onOpenReader({
                      contentType: 'book',
                      contentId: b.id,
                      title: b.title,
                      subtitle: b.author,
                      bookData: b,
                    });
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>
                    {(progressMap[selectedBook.id] ?? selectedBook.progressPercent ?? 0) > 0
                      ? 'Continuar Leitura'
                      : 'Iniciar Leitura'}
                  </span>
                </button>

                <button
                  onClick={(e) => handleToggleFavorite(selectedBook, e)}
                  className={`p-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    selectedBook.isFavorite
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-[#FBF9FF] border-[#EEEAF5] text-[#817B89] hover:text-[#292532]'
                  }`}
                  title={selectedBook.isFavorite ? 'Remover dos Favoritos' : 'Marcar Favorito'}
                >
                  <Star className={`w-4 h-4 ${selectedBook.isFavorite ? 'fill-amber-400' : ''}`} />
                </button>
              </div>

              {/* Secondary buttons row */}
              <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={(e) => handleToggleReadingList(selectedBook, e)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-[#77619E] transition-colors"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Quero Ler</span>
                  </button>

                  <button
                    onClick={() => customCoverInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-[#77619E] transition-colors"
                    title="Fazer upload de imagem de capa personalizada em alta definição"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[#B6A2DB]" />
                    <span>Trocar Capa</span>
                  </button>

                  <button
                    onClick={() => handleRepairSingleCover(selectedBook)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-[#77619E] transition-colors"
                    title="Re-extrair capa original a partir do arquivo"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#B6A2DB]" />
                    <span>Recuperar Capa</span>
                  </button>

                  {selectedBook.format === 'pdf' && (
                    <button
                      onClick={() => {
                        setPdfPagePickerBook(selectedBook);
                        setPdfPagePickerPage(1);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-[#77619E] transition-colors"
                      title="Escolher qualquer página do PDF como capa oficial"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#B6A2DB]" />
                      <span>Página do PDF</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteBook(selectedBook)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4.0 MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE LIVRO (100% NATIVO, SEM window.confirm) */}
      {bookToDelete && (
        <div className="fixed inset-0 z-70 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-sm w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-editorial text-base text-[#292532] font-semibold">Excluir Livro?</h3>
                <p className="text-[11px] text-[#817B89]">Esta ação removerá a obra da sua biblioteca.</p>
              </div>
            </div>

            <p className="text-xs text-[#292532] bg-[#FBF9FF] p-3 rounded-xl border border-[#EEEAF5] break-words break-all font-editorial italic leading-relaxed">
              &ldquo;{bookToDelete.title.replace(/_/g, ' ')}&rdquo;
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#EEEAF5]">
              <button
                type="button"
                disabled={isDeletingBook}
                onClick={() => setBookToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-[#EEEAF5] hover:bg-[#FBF9FF] text-xs text-[#817B89] font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingBook}
                onClick={handleExecuteDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingBook ? 'Excluindo...' : 'Sim, Excluir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4.1 MODAL DE SELEÇÃO DE PÁGINA DO PDF COMO CAPA */}
      {pdfPagePickerBook && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#77619E]" />
                <h3 className="font-editorial text-lg text-[#292532]">Escolher Página como Capa</h3>
              </div>
              <button
                onClick={() => setPdfPagePickerBook(null)}
                className="text-[#817B89] hover:text-[#292532] p-1 rounded-lg hover:bg-[#F5F0FF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#817B89]">
              Alguns PDFs possuem páginas em branco no início ou colocam a capa principal na página 2 ou 3. Escolha o número da página para renderizar como a capa oficial desta obra:
            </p>

            <div className="space-y-3 py-2">
              <label className="block text-xs font-medium text-[#292532]">
                Número da Página (1 a {pdfPagePickerBook.totalPages || 100}):
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={pdfPagePickerBook.totalPages || 500}
                  value={pdfPagePickerPage}
                  onChange={(e) => setPdfPagePickerPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-3 py-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-center text-sm font-semibold text-[#292532] focus:outline-none focus:border-[#77619E]"
                />
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setPdfPagePickerPage(pg)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        pdfPagePickerPage === pg
                          ? 'bg-[#77619E] text-white border-[#77619E]'
                          : 'bg-[#FBF9FF] text-[#817B89] border-[#EEEAF5] hover:text-[#292532]'
                      }`}
                    >
                      Pág. {pg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EEEAF5]">
              <button
                onClick={() => setPdfPagePickerBook(null)}
                className="px-4 py-2 rounded-xl text-xs text-[#817B89] hover:bg-[#FBF9FF] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyPdfPageCover}
                disabled={isSettingPdfCover}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50"
              >
                {isSettingPdfCover ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Renderizando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Definir como Capa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE IMPORTAÇÃO EM LOTE PROFISSIONAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-editorial text-lg text-[#292532] font-semibold leading-tight">
                    Importação de Livros em Lote
                  </h3>
                  <p className="text-[11px] text-[#817B89]">
                    Suporta seleção múltipla de PDFs e EPUBs com preservação de capas originais.
                  </p>
                </div>
              </div>
              <button
                disabled={isImporting}
                onClick={() => {
                  setShowImportModal(false);
                  if (importQueue.every((i) => i.status === 'success')) {
                    setImportQueue([]);
                  }
                  setImportCompletedSummary(null);
                }}
                className="p-1.5 rounded-lg text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF] transition-colors disabled:opacity-40"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Drop / Selection Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    addFilesToQueue(Array.from(e.dataTransfer.files));
                  }
                }}
                className={`p-5 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-[#77619E] bg-[#F5F0FF]'
                    : 'border-[#EEEAF5] bg-[#FBF9FF] hover:border-[#B6A2DB]'
                }`}
              >
                <div className="w-10 h-10 rounded-2xl bg-white border border-[#EEEAF5] shadow-xs flex items-center justify-center text-[#77619E]">
                  <UploadCloud className="w-5 h-5 text-[#B6A2DB]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#292532]">
                    Arraste vários livros aqui ou selecione no seu aparelho
                  </p>
                  <p className="text-[11px] text-[#817B89] mt-0.5">
                    Compatível com Android, Desktop, iOS e tablets (PDF e EPUB)
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Selecionar Arquivos (Múltiplos)</span>
                  </button>
                  {importQueue.length > 0 && !isImporting && (
                    <button
                      type="button"
                      onClick={handleClearQueue}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      Limpar fila
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.epub,application/pdf,application/epub+zip,application/x-mobipocket-ebook,application/vnd.comicbook+zip,.mobi,.cbz,.cbr,.txt,text/plain"
                  className="hidden"
                  disabled={isImporting}
                  onChange={handleFileInputChange}
                />
              </div>

              {/* Status Metric Badges */}
              {importQueue.length > 0 && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5]">
                    <span className="block text-[10px] uppercase font-medium text-[#817B89] tracking-wider">
                      Total
                    </span>
                    <span className="text-base font-semibold text-[#292532] font-editorial">
                      {importQueue.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="block text-[10px] uppercase font-medium text-emerald-800 tracking-wider">
                      Concluídos
                    </span>
                    <span className="text-base font-semibold text-emerald-700 font-editorial">
                      {importQueue.filter((i) => i.status === 'success').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="block text-[10px] uppercase font-medium text-amber-800 tracking-wider">
                      Pendentes
                    </span>
                    <span className="text-base font-semibold text-amber-700 font-editorial">
                      {importQueue.filter((i) => i.status === 'pending' || i.status === 'processing').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200">
                    <span className="block text-[10px] uppercase font-medium text-rose-800 tracking-wider">
                      Falhas
                    </span>
                    <span className="text-base font-semibold text-rose-700 font-editorial">
                      {importQueue.filter((i) => i.status === 'error').length}
                    </span>
                  </div>
                </div>
              )}

              {/* Progress Bar & Current File */}
              {isImporting && (
                <div className="p-3.5 rounded-2xl bg-[#F5F0FF] border border-[#EEEAF5] space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs text-[#77619E]">
                    <span className="truncate max-w-[280px] font-medium flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>{currentProcessingFile || 'Processando arquivo...'}</span>
                    </span>
                    <span className="font-semibold shrink-0">
                      {Math.round(
                        (importQueue.filter((i) => i.status === 'success' || i.status === 'error').length /
                          Math.max(1, importQueue.length)) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#EEEAF5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#77619E] transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.round(
                          (importQueue.filter((i) => i.status === 'success' || i.status === 'error').length /
                            Math.max(1, importQueue.length)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#817B89]">
                    <span>
                      {importQueue.filter((i) => i.status === 'success' || i.status === 'error').length} de{' '}
                      {importQueue.length} processados
                    </span>
                    <span className="text-[#77619E] font-medium">Extraindo metadados & capa original</span>
                  </div>
                </div>
              )}

              {/* Completed Summary Banner */}
              {importCompletedSummary && !isImporting && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                    importCompletedSummary.failed === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {importCompletedSummary.failed === 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">
                        {importCompletedSummary.failed === 0
                          ? `✓ Todos os ${importCompletedSummary.success} livros foram importados com sucesso!`
                          : `${importCompletedSummary.success} livros importados. ${importCompletedSummary.failed} arquivo(s) precisam de nova tentativa.`}
                      </p>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        Arquivos e capas foram salvos de forma persistente no seu aparelho.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Queue Items List */}
              {importQueue.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#817B89] px-1">
                    <span className="font-medium">Arquivos na fila ({importQueue.length})</span>
                    {!isImporting && importQueue.some((i) => i.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[#77619E] hover:underline text-[11px] font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar mais</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-2xl border border-[#EEEAF5] p-2 bg-[#FBF9FF]">
                    {importQueue.map((item) => {
                      const isPending = item.status === 'pending';
                      const isProcessing = item.status === 'processing';
                      const isSuccess = item.status === 'success';
                      const isError = item.status === 'error';

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 transition-colors ${
                            isProcessing
                              ? 'bg-[#F5F0FF] border-[#B6A2DB]'
                              : isSuccess
                              ? 'bg-white border-emerald-100'
                              : isError
                              ? 'bg-rose-50/60 border-rose-200'
                              : 'bg-white border-[#EEEAF5]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Icon status */}
                            <div className="shrink-0">
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 text-[#77619E] animate-spin" />
                              ) : isSuccess ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : isError ? (
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                              ) : (
                                <Clock className="w-4 h-4 text-[#B6A2DB]" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-[#292532] truncate">{item.fileName}</p>
                              {item.errorMessage ? (
                                <p className="text-[10px] text-rose-600 truncate mt-0.5">
                                  {item.errorMessage}
                                </p>
                              ) : (
                                <p className="text-[10px] text-[#817B89] truncate mt-0.5">
                                  {formatFileSize(item.fileSize)} •{' '}
                                  {isSuccess
                                    ? 'Capa e arquivo salvos'
                                    : isProcessing
                                    ? 'Extraindo metadados...'
                                    : 'Aguardando na fila'}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {isSuccess && (
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                Concluído
                              </span>
                            )}
                            {isError && (
                              <span className="text-[10px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                Falha
                              </span>
                            )}
                            {isPending && !isImporting && (
                              <button
                                type="button"
                                onClick={() => handleRemoveQueueItem(item.id)}
                                className="p-1 rounded-lg text-[#A09AA8] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Remover da fila"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#EEEAF5] shrink-0 flex-wrap">
              <div className="text-[11px] text-[#817B89]">
                {importQueue.length > 0 && (
                  <span>
                    {importQueue.filter((i) => i.status === 'success').length} de {importQueue.length}{' '}
                    importados
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isImporting ? (
                  <button
                    type="button"
                    onClick={handleCancelImport}
                    className="px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium cursor-pointer transition-colors"
                  >
                    Cancelar Restantes
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportModal(false);
                        if (importQueue.every((i) => i.status === 'success')) {
                          setImportQueue([]);
                        }
                        setImportCompletedSummary(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs text-[#817B89] hover:text-[#292532] cursor-pointer"
                    >
                      {importCompletedSummary ? 'Ver na Biblioteca' : 'Fechar'}
                    </button>

                    {/* Retry failed items if any */}
                    {importQueue.some((i) => i.status === 'error') && (
                      <button
                        type="button"
                        onClick={handleRetryFailed}
                        className="px-4 py-2 rounded-xl border border-[#B6A2DB] bg-[#F5F0FF] hover:bg-[#EEEAF5] text-[#77619E] text-xs font-semibold transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>
                          Tentar Novamente ({importQueue.filter((i) => i.status === 'error').length})
                        </span>
                      </button>
                    )}

                    {/* Start import button */}
                    {importQueue.some((i) => i.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => handleStartImport()}
                        className="px-5 py-2.5 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer flex items-center gap-2"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>
                          Importar {importQueue.filter((i) => i.status === 'pending').length} Livro(s)
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL DE RECUPERAÇÃO DE CAPAS EM LOTE */}
      {showRepairModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#77619E]" />
                <h3 className="font-editorial text-lg text-[#292532]">Verificação de Capas</h3>
              </div>
              <button
                disabled={isRepairing}
                onClick={() => {
                  setShowRepairModal(false);
                  setRepairResult(null);
                }}
                className="text-[#817B89] hover:text-[#292532]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#817B89] leading-relaxed">
              Esta ferramenta reprocessa os arquivos PDF e EPUB da biblioteca para extrair ou restaurar a arte da capa original com alta resolução.
            </p>

            {repairProgress && (
              <div className="space-y-1.5 p-3 rounded-xl bg-[#F5F0FF] border border-[#EEEAF5]">
                <div className="flex items-center justify-between text-xs text-[#77619E]">
                  <span className="truncate max-w-[200px]">{repairProgress.currentTitle}</span>
                  <span className="font-semibold">
                    {Math.round((repairProgress.current / repairProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#EEEAF5] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#77619E]"
                    style={{
                      width: `${Math.round((repairProgress.current / repairProgress.total) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-[10px] text-[#817B89]">
                  {repairProgress.current} de {repairProgress.total} analisados · {repairProgress.repairedCount} restauradas
                </div>
              </div>
            )}

            {repairResult && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <span className="font-semibold block">Resultado da Verificação:</span>
                <p className="text-[11px]">
                  Total de livros: {repairResult.total} · Capas recuperadas: {repairResult.repaired} · Sem alteração: {repairResult.skipped}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EEEAF5]">
              <button
                disabled={isRepairing}
                onClick={() => setShowRepairModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#817B89] hover:text-[#292532]"
              >
                Fechar
              </button>
              <button
                disabled={isRepairing}
                onClick={handleStartBatchRepair}
                className="px-4 py-2.5 rounded-xl bg-[#77619E] hover:bg-[#68538D] disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                {isRepairing ? 'Verificando...' : 'Verificar Todas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. BARRA FLUTUANTE DE AÇÕES EM LOTE (SELEÇÃO MÚLTIPLA) */}
      {isSelectionMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl bg-white/95 backdrop-blur-md border border-[#EEEAF5] shadow-[0_12px_36px_rgba(41,37,50,0.18)] rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSelectAllVisible}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FBF9FF] hover:bg-[#F5F0FF] border border-[#EEEAF5] text-xs font-medium text-[#77619E] transition-colors cursor-pointer"
            >
              {selectedBookIds.size === filteredAndSortedBooks.slice(0, visibleCount).length && selectedBookIds.size > 0 ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Desmarcar Todos</span>
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Selecionar Todos</span>
                </>
              )}
            </button>
            <span className="text-xs font-semibold text-[#292532] hidden sm:inline">
              {selectedBookIds.size}{' '}
              {selectedBookIds.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExitSelectionMode}
              className="px-3 py-1.5 rounded-xl text-xs text-[#817B89] hover:bg-[#FBF9FF] transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={() => setShowBatchDeleteModal(true)}
              disabled={selectedBookIds.size === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                Excluir {selectedBookIds.size > 0 ? `(${selectedBookIds.size})` : ''}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 8. MODAL DE CONFIRMAÇÃO DE EXCLUSÃO EM LOTE */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-editorial text-xl text-[#292532] font-semibold">
                Excluir {selectedBookIds.size} {selectedBookIds.size === 1 ? 'livro' : 'livros'}?
              </h3>
              <p className="text-xs text-[#817B89] leading-relaxed">
                Esta ação removerá permanentemente os {selectedBookIds.size} livros selecionados, seus arquivos locais e registros de leitura. Esta ação não poderá ser desfeita.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#EEEAF5]">
              <button
                disabled={isDeletingBatch}
                onClick={() => setShowBatchDeleteModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#EEEAF5] text-xs font-medium text-[#817B89] hover:bg-[#FBF9FF] transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                disabled={isDeletingBatch}
                onClick={handleConfirmBatchDelete}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {isDeletingBatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#292532] text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-[#77619E]/30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
