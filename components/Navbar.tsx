import React, { useSyncExternalStore } from 'react';
import {
  Compass,
  BookOpen,
  BookMarked,
  Library,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getUserProfile, subscribeUserProfile, DEFAULT_USER_PROFILE } from '@/lib/userService';

export type ActiveTab = 'home' | 'bible' | 'devotional' | 'library' | 'profile';

interface NavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOffline?: boolean;
}

export const TopBar: React.FC<{
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOffline?: boolean;
}> = ({ activeTab, onTabChange, isOffline }) => {
  const profile = useSyncExternalStore(
    subscribeUserProfile,
    getUserProfile,
    () => DEFAULT_USER_PROFILE
  );
  const userInitial = (profile.name || 'A').charAt(0).toUpperCase();

  const navItems: { tab: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { tab: 'home', label: 'Início', icon: Compass },
    { tab: 'bible', label: 'Bíblia', icon: BookOpen },
    { tab: 'devotional', label: 'Devocional', icon: BookMarked },
    { tab: 'library', label: 'Biblioteca', icon: Library },
    { tab: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#EEEAF5] px-3 py-2 sm:px-6 transition-colors overflow-x-hidden">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand: ALTTO Minimalist Lilac */}
        <div
          id="altto-logo-brand"
          className="flex items-center gap-2 cursor-pointer select-none group"
          onClick={() => onTabChange('home')}
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden border border-[#EEEAF5] flex items-center justify-center group-hover:border-[#B6A2DB] transition-all duration-200 shadow-2xs bg-white">
            <img src="/icon.svg" alt="ALTTO" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-editorial text-base font-semibold tracking-tight text-[#292532]">
                ALTTO
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#B6A2DB]" />
            </div>
            <span className="text-[10px] font-sans text-[#A09AA8] tracking-wider uppercase">
              Editorial
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links — Clean, unboxed minimalist tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-[#FBF9FF] p-0.5 rounded-xl border border-[#EEEAF5]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                id={`nav-desktop-${item.tab}`}
                onClick={() => onTabChange(item.tab)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-[#FFFFFF] text-[#77619E] shadow-2xs border border-[#EEEAF5] font-semibold'
                    : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FFFFFF]/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#77619E]' : 'text-[#A09AA8]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Offline indicator & Profile */}
        <div className="flex items-center gap-3">
          {isOffline && (
            <div
              id="status-badge-offline"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#FBF9FF] border border-[#EEEAF5] text-[#817B89]"
              title="Modo Offline"
            >
              <WifiOff className="w-3.5 h-3.5 text-[#B6A2DB]" />
              <span className="text-[11px] font-medium">Offline</span>
            </div>
          )}

          {/* User Profile Capsule */}
          <button
            id="btn-topbar-profile"
            onClick={() => onTabChange('profile')}
            className="flex items-center gap-2.5 pl-2 pr-1 py-1 rounded-full hover:bg-[#FBF9FF] border border-transparent hover:border-[#EEEAF5] transition-all cursor-pointer group"
          >
            <span className="text-xs font-medium text-[#292532] max-w-[120px] truncate hidden sm:inline">
              {profile.name || 'Leitor'}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#F5F0FF] border border-[#EEEAF5] overflow-hidden flex items-center justify-center shrink-0 group-hover:border-[#B6A2DB] transition-colors">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-editorial font-semibold text-[#77619E]">{userInitial}</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export const BottomNav: React.FC<NavProps> = ({ activeTab, onTabChange }) => {
  const tabs: { tab: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { tab: 'home', label: 'Início', icon: Compass },
    { tab: 'bible', label: 'Bíblia', icon: BookOpen },
    { tab: 'devotional', label: 'Devocional', icon: BookMarked },
    { tab: 'library', label: 'Biblioteca', icon: Library },
    { tab: 'profile', label: 'Perfil', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#FFFFFF]/95 backdrop-blur-md border-t border-[#EEEAF5] px-2 py-1 pb-safe shadow-[0_-2px_12px_rgba(119,97,158,0.03)] overflow-x-hidden w-full">
      <div className="grid grid-cols-5 gap-0.5 max-w-md mx-auto w-full">
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              id={`tab-btn-${item.tab}`}
              onClick={() => onTabChange(item.tab)}
              className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-lg transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#F5F0FF] text-[#77619E] font-medium'
                  : 'text-[#817B89] hover:text-[#292532]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 mb-0.5 ${isActive ? 'text-[#77619E]' : 'text-[#A09AA8]'}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
