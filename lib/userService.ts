// User Profile Service with reactive localStorage persistence

export interface UserProfile {
  name: string;
  avatarUrl?: string; // base64 or image URL
  avatarPreset?: string;
  favoriteVerse?: string;
  bio?: string;
  dailyGoalChapters?: number;
  streakDays?: number;
  updatedAt?: string;
}

const STORAGE_KEY = 'altto_user_profile';

export const AVATAR_PRESETS = [
  { id: 'gold', name: 'Luz Dourada', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  { id: 'cream', name: 'Creme Alvorada', bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' },
  { id: 'emerald', name: 'Oliveira Verde', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  { id: 'sky', name: 'Céu Sagrado', bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300' },
  { id: 'indigo', name: 'Noite de Vigília', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Anderson',
  avatarUrl: '',
  avatarPreset: 'gold',
  favoriteVerse: 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)',
  bio: 'Buscando a Deus através da leitura diária da Palavra.',
  dailyGoalChapters: 3,
  streakDays: 1,
};

let cachedProfile: UserProfile = DEFAULT_USER_PROFILE;
let cachedRawString: string | null = null;
let isCacheLoaded = false;

export function getUserProfile(): UserProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_PROFILE;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!isCacheLoaded || saved !== cachedRawString) {
      cachedRawString = saved;
      isCacheLoaded = true;
      if (saved) {
        const parsed = JSON.parse(saved);
        cachedProfile = {
          name: parsed.name || 'Anderson',
          avatarUrl: parsed.avatarUrl || '',
          avatarPreset: parsed.avatarPreset || 'gold',
          favoriteVerse: parsed.favoriteVerse || 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)',
          bio: parsed.bio || 'Buscando a Deus através da leitura diária da Palavra.',
          dailyGoalChapters: parsed.dailyGoalChapters || 3,
          streakDays: parsed.streakDays || 1,
          updatedAt: parsed.updatedAt,
        };
      } else {
        cachedProfile = DEFAULT_USER_PROFILE;
      }
    }
    return cachedProfile;
  } catch (err) {
    console.warn('Erro ao carregar perfil do usuário:', err);
    return cachedProfile || DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(data: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const updated: UserProfile = {
    ...current,
    ...data,
    name: (data.name !== undefined ? data.name.trim() : current.name) || 'Anderson',
    updatedAt: new Date().toISOString(),
  };

  cachedProfile = updated;
  if (typeof window !== 'undefined') {
    try {
      const raw = JSON.stringify(updated);
      cachedRawString = raw;
      isCacheLoaded = true;
      localStorage.setItem(STORAGE_KEY, raw);
      window.dispatchEvent(new Event('altto_profile_updated'));
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
    }
  }
  return updated;
}

export function subscribeUserProfile(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleUpdate = () => {
    isCacheLoaded = false;
    callback();
  };
  window.addEventListener('altto_profile_updated', handleUpdate);
  window.addEventListener('storage', handleUpdate);
  return () => {
    window.removeEventListener('altto_profile_updated', handleUpdate);
    window.removeEventListener('storage', handleUpdate);
  };
}

export function processAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedBase64);
      };
      img.onerror = () => reject(new Error('Erro ao renderizar imagem.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de foto.'));
    reader.readAsDataURL(file);
  });
}
