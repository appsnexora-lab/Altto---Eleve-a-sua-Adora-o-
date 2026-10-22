'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  MessageSquare,
  Bookmark,
  Highlighter,
  Download,
  Upload,
  Calendar,
  Search,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Smartphone,
  Cloud,
  FileJson,
  Camera,
  Check,
  Edit3,
  Flame,
} from 'lucide-react';
import { BibleReflection, Bookmark as BookmarkType, Highlight, Annotation } from '@/types';
import { getAllBibleReflections } from '@/lib/bibleService';
import { getBookmarks, getHighlights, getAnnotations, deleteBookmark, deleteHighlight, deleteAnnotation } from '@/lib/readerService';
import { exportAllDataAsJSON, importDataFromJSON } from '@/lib/indexedDB';
import {
  getUserProfile,
  saveUserProfile,
  processAvatarImage,
  AVATAR_PRESETS,
  UserProfile,
} from '@/lib/userService';
import { auth, onAuthStateChanged, User as FirebaseUser } from '@/lib/firebase';
import {
  loginWithGoogle,
  logoutFirebase,
  pushAllToCloud,
  getCurrentUserId,
} from '@/lib/firebaseSyncService';

export const ProfileView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'diary' | 'bookmarks' | 'highlights' | 'backup'>(
    'profile'
  );

  // User Profile Form State
  const [profile, setProfile] = useState<UserProfile>(getUserProfile());
  const [nameInput, setNameInput] = useState<string>(profile.name);
  const [verseInput, setVerseInput] = useState<string>(profile.favoriteVerse || '');
  const [bioInput, setBioInput] = useState<string>(profile.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string>(profile.avatarUrl || '');
  const [selectedPreset, setSelectedPreset] = useState<string>(profile.avatarPreset || 'gold');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firebase Cloud Sync State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  const [reflections, setReflections] = useState<BibleReflection[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const loadData = async () => {
    const p = getUserProfile();
    setProfile(p);
    setNameInput(p.name);
    setVerseInput(p.favoriteVerse || '');
    setBioInput(p.bio || '');
    setAvatarPreview(p.avatarUrl || '');
    setSelectedPreset(p.avatarPreset || 'gold');

    const r = await getAllBibleReflections();
    setReflections(r);
    const b = await getBookmarks();
    setBookmarks(b);
    const h = await getHighlights();
    setHighlights(h);
    const a = await getAnnotations();
    setAnnotations(a);
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchData() {
      const p = getUserProfile();
      if (!isCancelled) {
        setProfile(p);
        setNameInput(p.name);
        setVerseInput(p.favoriteVerse || '');
        setBioInput(p.bio || '');
        setAvatarPreview(p.avatarUrl || '');
        setSelectedPreset(p.avatarPreset || 'gold');
      }
      const r = await getAllBibleReflections();
      if (isCancelled) return;
      setReflections(r);
      const b = await getBookmarks();
      if (isCancelled) return;
      setBookmarks(b);
      const h = await getHighlights();
      if (isCancelled) return;
      setHighlights(h);
      const a = await getAnnotations();
      if (!isCancelled) setAnnotations(a);
    }
    fetchData();
    return () => {
      isCancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Avatar Image Upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await processAvatarImage(file);
      setAvatarPreview(base64);
      const updated = saveUserProfile({
        name: nameInput.trim() || profile.name || 'Anderson',
        avatarUrl: base64,
        avatarPreset: selectedPreset,
        favoriteVerse: verseInput.trim(),
        bio: bioInput.trim(),
      });
      setProfile(updated);
      showToast('✓ Foto do perfil atualizada e salva permanentemente!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar imagem.');
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    const updated = saveUserProfile({
      name: nameInput.trim() || profile.name || 'Anderson',
      avatarUrl: '',
      avatarPreset: selectedPreset,
      favoriteVerse: verseInput.trim(),
      bio: bioInput.trim(),
    });
    setProfile(updated);
    showToast('✓ Foto removida e perfil salvo!');
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const updated = saveUserProfile({
      name: nameInput.trim() || profile.name || 'Anderson',
      avatarPreset: presetId,
      avatarUrl: avatarPreview,
      favoriteVerse: verseInput.trim(),
      bio: bioInput.trim(),
    });
    setProfile(updated);
  };

  // Save Profile Handler
  const handleSaveProfile = () => {
    setIsSavingProfile(true);
    const updated = saveUserProfile({
      name: nameInput.trim() || 'Anderson',
      avatarUrl: avatarPreview,
      avatarPreset: selectedPreset,
      favoriteVerse: verseInput.trim(),
      bio: bioInput.trim(),
    });
    setProfile(updated);
    setTimeout(() => {
      setIsSavingProfile(false);
      showToast(`✓ Perfil de ${updated.name} salvo com sucesso!`);
    }, 300);
  };

  // Firebase Auth & Cloud Sync Handlers
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const u = await loginWithGoogle();
      if (u) {
        showToast(`✓ Conectado ao Firebase como ${u.displayName || u.email}!`);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao conectar com Firebase.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFirebase();
      showToast('Conta desconectada do Firebase.');
    } catch (err: any) {
      showToast('Erro ao desconectar.');
    }
  };

  const handleManualCloudSync = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await pushAllToCloud();
      if (res.success) {
        showToast(`✓ Nuvem Firebase sincronizada com sucesso! (${res.count} itens gravados)`);
      } else {
        showToast('Conecte sua conta com o Google para sincronizar na nuvem.');
      }
    } catch (err: any) {
      showToast('Erro ao sincronizar com o Firebase.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Export Full JSON Backup
  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const jsonStr = await exportAllDataAsJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALTTO-Backup-Cristao-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup completo baixado com sucesso!');
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar backup.');
    } finally {
      setIsExporting(false);
    }
  };

  // Import Full JSON Backup
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importDataFromJSON(text);
      await loadData();
      showToast('Backup restaurado com sucesso! Todos os dados foram atualizados.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao importar backup. Verifique se o arquivo JSON é válido.');
    }
  };

  const filteredReflections = reflections.filter(r =>
    r.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.bookName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.date.includes(searchFilter)
  );

  return (
    <div id="profile-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7 bg-[#FFFFFF] min-h-screen text-[#292532]">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-5 flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#77619E]">
              Conta & Preferências
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-normal font-editorial tracking-tight text-[#292532]">
            Perfil & Caderno
          </h1>
          <p className="text-xs sm:text-sm text-[#817B89]">
            Suas reflexões espirituais, marcadores, trechos destacados e backup seguro.
          </p>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sub tabs — Sem rolagem lateral, totalmente compacto */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 border-b border-[#EEEAF5] pb-2 text-xs">
        <button
          id="profile-tab-btn-me"
          onClick={() => setActiveTab('profile')}
          className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]'
              : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
          }`}
        >
          <User className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Meu Perfil</span>
        </button>
        <button
          id="profile-tab-btn-diary"
          onClick={() => setActiveTab('diary')}
          className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'diary'
              ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]'
              : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Diário Espiritual ({reflections.length})</span>
        </button>
        <button
          id="profile-tab-btn-bookmarks"
          onClick={() => setActiveTab('bookmarks')}
          className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'bookmarks'
              ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]'
              : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Marcadores ({bookmarks.length})</span>
        </button>
        <button
          id="profile-tab-btn-highlights"
          onClick={() => setActiveTab('highlights')}
          className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'highlights'
              ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]'
              : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
          }`}
        >
          <Highlighter className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Destaques & Anotações ({highlights.length + annotations.length})</span>
        </button>
        <button
          id="profile-tab-btn-backup"
          onClick={() => setActiveTab('backup')}
          className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]'
              : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-[#B6A2DB]" />
          <span>Backup & Offline</span>
        </button>
      </div>

      {/* SECTION 0: MEU PERFIL DO USUÁRIO */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] shadow-xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="relative group">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-white border border-[#EEEAF5] shadow-xs flex items-center justify-center relative">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={nameInput || 'Usuário'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#F5F0FF] flex items-center justify-center text-3xl font-editorial text-[#77619E]">
                        {(nameInput.trim() || 'A').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label
                    htmlFor="avatar-upload-input"
                    className="absolute -bottom-1.5 -right-1.5 p-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white shadow-xs cursor-pointer border border-white transition-colors"
                    title="Carregar foto do seu dispositivo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      id="avatar-upload-input"
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                {avatarPreview && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="text-[11px] font-medium text-[#817B89] hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Remover foto
                  </button>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-[#EEEAF5] text-[11px] font-medium text-[#77619E]">
                  <User className="w-3 h-3 text-[#B6A2DB]" />
                  <span>Pré-visualização da Saudação</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-normal font-editorial text-[#292532] tracking-tight">
                  {(() => {
                    const hour = new Date().getHours();
                    const greeting =
                      hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
                    return `${greeting}, ${nameInput.trim() || 'Leitor'}!`;
                  })()}
                </h2>
                <p className="text-xs sm:text-sm text-[#817B89] italic font-editorial max-w-lg">
                  &ldquo;{verseInput.trim() || 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)'}&rdquo;
                </p>
                {bioInput && (
                  <p className="text-xs text-[#817B89] max-w-lg">
                    {bioInput}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Firebase Cloud Sync Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#EEEAF5] shadow-xs flex items-center justify-center text-[#77619E] shrink-0">
                <Cloud className="w-5 h-5 text-[#77619E]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#292532]">
                    {firebaseUser ? 'Nuvem Conectada' : 'Nuvem Desconectada'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    firebaseUser ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {firebaseUser ? 'Firebase Ativo' : 'Apenas Local'}
                  </span>
                </div>
                <p className="text-[11px] text-[#817B89] mt-0.5">
                  {firebaseUser
                    ? `Sincronizando com Google (${firebaseUser.email || firebaseUser.displayName}) · Projeto pacific-song-xrr5c`
                    : 'Conecte sua conta Google para sincronizar e salvar fotos, bíblias e livros em qualquer aparelho.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {firebaseUser ? (
                <>
                  <button
                    onClick={handleManualCloudSync}
                    disabled={isSyncingCloud}
                    className="px-3.5 py-1.5 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nuvem'}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 rounded-xl border border-[#EEEAF5] hover:bg-white text-rose-600 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Desconectar
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-semibold transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Cloud className="w-4 h-4" />
                  <span>{isLoggingIn ? 'Conectando...' : 'Conectar com Google / Firebase'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#EEEAF5] shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-[#EEEAF5] pb-3">
              <Edit3 className="w-4 h-4 text-[#B6A2DB]" />
              <h3 className="text-sm font-semibold text-[#292532]">
                Personalizar Meu Nome & Perfil
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-[#292532] flex items-center justify-between">
                  <span>Seu Nome ou Como deseja ser chamado:</span>
                  <span className="text-[10px] text-[#77619E] font-medium">Usado na saudação inicial</span>
                </label>
                <input
                  id="user-profile-name-input"
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Ex: Anderson, Maria, José, etc."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-[#292532]">
                  Versículo ou Lema Espiritual Favorito:
                </label>
                <input
                  id="user-profile-verse-input"
                  type="text"
                  value={verseInput}
                  onChange={e => setVerseInput(e.target.value)}
                  placeholder="Ex: O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-[#292532]">
                  Sobre minha caminhada com Deus (Opcional):
                </label>
                <textarea
                  id="user-profile-bio-input"
                  rows={2}
                  value={bioInput}
                  onChange={e => setBioInput(e.target.value)}
                  placeholder="Ex: Dedicado a ler a Bíblia todos os dias pela manhã, tarde e noite."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] text-xs text-[#292532] focus:outline-none focus:border-[#B6A2DB] resize-none"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-medium text-[#292532]">
                  Estilo de Cor do Monograma:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {AVATAR_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
                        selectedPreset === preset.id
                          ? 'border-[#77619E] bg-[#F5F0FF]'
                          : 'border-[#EEEAF5] bg-[#FBF9FF] hover:bg-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md ${preset.bg} ${preset.text} font-medium text-[10px] flex items-center justify-center border ${preset.border}`}>
                        {(nameInput.trim() || 'A').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[11px] text-[#292532] truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EEEAF5]">
              <button
                id="btn-save-user-profile"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="px-5 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center mx-auto">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <span className="text-xl font-editorial text-[#292532] block">
                {profile.streakDays || 1}
              </span>
              <span className="text-[10px] font-medium text-[#817B89] uppercase tracking-wider">
                Dias de Foco
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center mx-auto">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <span className="text-xl font-editorial text-[#292532] block">
                {reflections.length}
              </span>
              <span className="text-[10px] font-medium text-[#817B89] uppercase tracking-wider">
                Reflexões
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center mx-auto">
                <Bookmark className="w-3.5 h-3.5" />
              </div>
              <span className="text-xl font-editorial text-[#292532] block">
                {bookmarks.length}
              </span>
              <span className="text-[10px] font-medium text-[#817B89] uppercase tracking-wider">
                Marcadores
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white border border-[#EEEAF5] text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center mx-auto">
                <Highlighter className="w-3.5 h-3.5" />
              </div>
              <span className="text-xl font-editorial text-[#292532] block">
                {highlights.length + annotations.length}
              </span>
              <span className="text-[10px] font-medium text-[#817B89] uppercase tracking-wider">
                Anotações
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: DIÁRIO ESPIRITUAL */}
      {activeTab === 'diary' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B6A2DB]" />
            <input
              type="text"
              placeholder="Pesquisar em reflexões antigas..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full bg-[#FBF9FF] border border-[#EEEAF5] rounded-xl pl-9 pr-3 py-2 text-xs text-[#292532] placeholder:text-[#A09AA8] focus:outline-none focus:border-[#B6A2DB]"
            />
          </div>

          {filteredReflections.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-[#B6A2DB] mx-auto" />
              <h3 className="text-sm font-semibold text-[#292532]">
                Nenhuma reflexão espiritual encontrada.
              </h3>
              <p className="text-xs text-[#817B89] max-w-sm mx-auto">
                Após ler seus capítulos na aba Bíblia ou no Devocional, registre suas notas para construir seu histórico.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReflections.map(r => (
                <div
                  key={r.id}
                  className="p-5 rounded-2xl bg-white border border-[#EEEAF5] space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#77619E] font-editorial">
                        {r.bookName} {r.chapterNumber}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#F5F0FF] border border-[#EEEAF5] text-[#77619E] uppercase font-medium">
                        {r.period === 'morning'
                          ? 'Manhã'
                          : r.period === 'afternoon'
                          ? 'Tarde'
                          : 'Noite'}
                      </span>
                    </div>
                    <span className="text-xs text-[#817B89] flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-[#B6A2DB]" />
                      {r.date}
                    </span>
                  </div>
                  <p className="text-xs text-[#292532] leading-relaxed italic bg-[#FBF9FF] p-3.5 rounded-xl border border-[#EEEAF5]">
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: MARCADORES */}
      {activeTab === 'bookmarks' && (
        <div className="space-y-3">
          {bookmarks.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] text-center text-xs text-[#817B89]">
              Nenhum marcador salvo ainda. Toque no ícone de marcador durante a leitura para salvar sua posição.
            </div>
          ) : (
            bookmarks.map(b => (
              <div
                key={b.id}
                className="p-4 rounded-xl bg-white border border-[#EEEAF5] flex items-center justify-between shadow-xs"
              >
                <div>
                  <h4 className="text-xs font-semibold text-[#292532] font-editorial">{b.title}</h4>
                  <p className="text-[11px] text-[#77619E] font-medium mt-0.5">{b.location}</p>
                  <p className="text-[10px] text-[#817B89] mt-0.5">
                    {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await deleteBookmark(b.id);
                    await loadData();
                    showToast('Marcador removido');
                  }}
                  className="p-1.5 text-[#A09AA8] hover:text-rose-600 rounded-lg hover:bg-rose-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION 3: DESTAQUES & ANOTAÇÕES */}
      {activeTab === 'highlights' && (
        <div className="space-y-3">
          {highlights.length === 0 && annotations.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] text-center text-xs text-[#817B89]">
              Nenhum destaque ou anotação registrado. Selecione qualquer texto no leitor para destacar ou adicionar notas espirituais.
            </div>
          ) : (
            <>
              {highlights.map(h => (
                <div
                  key={h.id}
                  className="p-4 rounded-xl bg-white border border-[#EEEAF5] space-y-2 shadow-xs"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#77619E]">{h.location}</span>
                    <button
                      onClick={async () => {
                        await deleteHighlight(h.id);
                        await loadData();
                        showToast('Destaque removido');
                      }}
                      className="text-[#A09AA8] hover:text-rose-600 rounded-lg p-1 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div
                    className={`p-3 rounded-lg text-xs italic ${
                      h.color === 'emerald'
                        ? 'bg-emerald-50 text-emerald-900 border-l-2 border-emerald-500'
                        : h.color === 'sky'
                        ? 'bg-sky-50 text-sky-900 border-l-2 border-sky-500'
                        : h.color === 'rose'
                        ? 'bg-rose-50 text-rose-900 border-l-2 border-rose-500'
                        : 'bg-[#F5F0FF] text-[#77619E] border-l-2 border-[#77619E]'
                    }`}
                  >
                    &ldquo;{h.text}&rdquo;
                  </div>
                  {h.note && <p className="text-xs text-[#817B89] font-medium">Nota: {h.note}</p>}
                </div>
              ))}
              {annotations.map(a => (
                <div
                  key={a.id}
                  className="p-4 rounded-xl bg-white border border-[#EEEAF5] space-y-2 shadow-xs"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#292532]">{a.title || a.location}</span>
                    <button
                      onClick={async () => {
                        await deleteAnnotation(a.id);
                        await loadData();
                        showToast('Anotação removida');
                      }}
                      className="text-[#A09AA8] hover:text-rose-600 rounded-lg p-1 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[#292532] bg-[#FBF9FF] border border-[#EEEAF5] p-3 rounded-lg">{a.text}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* SECTION 4: BACKUP & OFFLINE */}
      {activeTab === 'backup' && (
        <div className="p-6 rounded-2xl bg-white border border-[#EEEAF5] space-y-6 shadow-xs">
          {/* Firebase Cloud Sync Status Card */}
          <div className="p-5 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#EEEAF5] shadow-xs flex items-center justify-center text-[#77619E] shrink-0">
                  <Cloud className="w-5 h-5 text-[#77619E]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#292532]">
                      Sincronização em Nuvem (Firebase Firestore)
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      firebaseUser ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {firebaseUser ? 'Ativo & Conectado' : 'Aguardando Login'}
                    </span>
                  </div>
                  <p className="text-xs text-[#817B89] mt-0.5">
                    {firebaseUser
                      ? `Conta vinculada: ${firebaseUser.email || firebaseUser.displayName} · Projeto: pacific-song-xrr5c`
                      : 'Todas as alterações de perfil, livros, bíblias e devocionais são sincronizadas na sua nuvem Firebase.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {firebaseUser ? (
                  <>
                    <button
                      onClick={handleManualCloudSync}
                      disabled={isSyncingCloud}
                      className="px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-medium transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Tudo Agora'}</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-2 rounded-xl border border-[#EEEAF5] hover:bg-white text-rose-600 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="px-4 py-2 rounded-xl bg-[#77619E] hover:bg-[#68538D] text-white text-xs font-semibold transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>{isLoggingIn ? 'Conectando...' : 'Conectar Conta Google'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#EEEAF5] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-[#817B89]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Foto & Perfil salvos no Firestore</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Bíblias & Devocionais sincronizados</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Progresso mantido ao fechar o app</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-[#77619E] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-[#292532]">
                Soberania dos Dados & Armazenamento Local
              </h3>
              <p className="text-xs text-[#817B89] mt-1 leading-relaxed">
                O ALTTO funciona de forma 100% offline. Todos os seus dados, leituras, reflexões, Bíblias e livros são gravados de forma persistente no seu dispositivo (IndexedDB).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Export */}
            <div className="p-4 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] space-y-3">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[#77619E]" />
                <h4 className="text-xs font-semibold text-[#292532] uppercase">Exportar Backup</h4>
              </div>
              <p className="text-xs text-[#817B89]">
                Gera um arquivo .json seguro com todas as suas leituras, reflexões, marcadores e configurações.
              </p>
              <button
                disabled={isExporting}
                onClick={handleExportBackup}
                className="w-full py-2.5 rounded-xl bg-[#77619E] text-white font-medium text-xs hover:bg-[#68538D] transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <FileJson className="w-4 h-4" />
                <span>{isExporting ? 'Exportando...' : 'Baixar Arquivo JSON'}</span>
              </button>
            </div>

            {/* Import */}
            <div className="p-4 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#77619E]" />
                <h4 className="text-xs font-semibold text-[#292532] uppercase">Restaurar Backup</h4>
              </div>
              <p className="text-xs text-[#817B89]">
                Restaure seus dados ao trocar de aparelho ou recuperar um ponto anterior.
              </p>
              <label className="w-full py-2.5 rounded-xl bg-white border border-[#EEEAF5] hover:border-[#B6A2DB] text-[#292532] font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                <Upload className="w-4 h-4 text-[#B6A2DB]" />
                <span>Selecionar Arquivo JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* App Installation & PWA Icon Card */}
          <div className="p-4 rounded-xl bg-[#FBF9FF] border border-[#EEEAF5] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden border border-[#EEEAF5] shadow-xs shrink-0 bg-white p-0.5">
                <img src="/pwa-192x192.png" alt="Ícone Oficial do ALTTO" className="w-full h-full object-contain rounded-xl" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-editorial font-semibold text-[#292532]">ALTTO — Leitura Editorial</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5]">PWA Oficial</span>
                </div>
                <p className="text-xs text-[#817B89] mt-0.5">
                  Ícone oficial configurado para tela inicial em Android e iPhone (alta definição 512x512).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
              <div className="p-3 rounded-lg bg-white border border-[#EEEAF5] space-y-1">
                <span className="font-semibold text-[#77619E] block">No Android (Chrome)</span>
                <p className="text-[11px] text-[#817B89]">
                  Toque nos três pontinhos (⋮) do navegador e selecione <strong className="text-[#292532]">"Instalar aplicativo"</strong> ou "Adicionar à tela inicial".
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#EEEAF5] space-y-1">
                <span className="font-semibold text-[#77619E] block">No iPhone / iPad (Safari)</span>
                <p className="text-[11px] text-[#817B89]">
                  Toque no botão de Compartilhar (quadrado com seta) e selecione <strong className="text-[#292532]">"Adicionar à Tela de Início"</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EEEAF5] flex items-center justify-between text-xs text-[#817B89]">
            <span className="flex items-center gap-1.5 font-medium">
              <Smartphone className="w-4 h-4 text-[#B6A2DB]" />
              <span>Armazenamento local ativo (IndexedDB)</span>
            </span>
            <span className="text-emerald-700 font-semibold">✓ Pronto para uso offline</span>
          </div>
        </div>
      )}
    </div>
  );
};
