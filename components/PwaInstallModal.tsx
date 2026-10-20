'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Share2,
  MoreVertical,
  PlusSquare,
  CheckCircle2,
  Sparkles,
  Download,
  ArrowRight,
} from 'lucide-react';

interface PwaInstallModalProps {
  onClose: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({ onClose }) => {
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    // Detect iOS vs Android
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) {
      setPlatform('ios');
    } else {
      setPlatform('android');
    }

    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setIsInstalled(true);
    }

    // Listen for native beforeinstallprompt (Chrome / Android / Edge)
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleNativeInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-[#EEEAF5] shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EEEAF5] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F5F0FF] text-[#77619E] flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-editorial text-lg text-[#292532] font-semibold leading-tight">
                Ícone do App no Celular
              </h3>
              <p className="text-[11px] text-[#817B89]">
                Tenha o ALTTO como aplicativo na tela inicial do seu celular.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Icon Preview Card */}
        <div className="p-4 rounded-2xl bg-[#FBF9FF] border border-[#EEEAF5] flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white border border-[#EEEAF5] shadow-xs shrink-0 flex items-center justify-center p-1">
            <img
              src="/pwa-192x192.png"
              alt="ALTTO Ícone"
              className="w-full h-full object-cover rounded-xl"
              onError={(e) => {
                // Fallback to SVG if PNG is loading
                (e.target as HTMLImageElement).src = '/icon.svg';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="font-editorial text-base font-semibold text-[#292532] leading-tight">
                ALTTO
              </h4>
              <span className="w-1.5 h-1.5 rounded-full bg-[#B6A2DB]" />
              <span className="text-[10px] font-semibold text-[#77619E] bg-[#F5F0FF] px-2 py-0.5 rounded-md border border-[#EEEAF5]">
                App PWA
              </span>
            </div>
            <p className="text-xs text-[#817B89] mt-0.5 truncate">
              Leitura Digital, Bíblia e Devocional
            </p>
            <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Abre em tela cheia e funciona 100% offline</span>
            </p>
          </div>
        </div>

        {/* 1-Tap native install button if supported */}
        {deferredPrompt && !isInstalled && (
          <button
            onClick={handleNativeInstall}
            className="w-full py-3 px-4 rounded-2xl bg-[#77619E] hover:bg-[#68538D] text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Instalar Aplicativo com 1 Toque</span>
          </button>
        )}

        {/* Platform Selector Tabs */}
        <div className="flex items-center gap-2 border-b border-[#EEEAF5] pb-2">
          <button
            onClick={() => setPlatform('android')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer text-center ${
              platform === 'android'
                ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] font-semibold'
                : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
            }`}
          >
            Android (Google Chrome / Edge)
          </button>
          <button
            onClick={() => setPlatform('ios')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer text-center ${
              platform === 'ios'
                ? 'bg-[#F5F0FF] text-[#77619E] border border-[#EEEAF5] font-semibold'
                : 'text-[#817B89] hover:text-[#292532] hover:bg-[#FBF9FF]'
            }`}
          >
            iPhone & iPad (Safari)
          </button>
        </div>

        {/* Instructions */}
        {platform === 'android' ? (
          <div className="space-y-3 text-xs text-[#292532]">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Toque no menu do Chrome (três pontinhos)</span>
                <p className="text-[11px] text-[#817B89]">
                  No topo direito do navegador, clique no ícone <MoreVertical className="w-3.5 h-3.5 inline text-[#77619E]" />.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Escolha &ldquo;Instalar aplicativo&rdquo; ou &ldquo;Adicionar à tela inicial&rdquo;</span>
                <p className="text-[11px] text-[#817B89]">
                  O navegador identificará o manifesto do <strong>ALTTO</strong> com o ícone lilás oficial.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Confirme em &ldquo;Instalar&rdquo;</span>
                <p className="text-[11px] text-[#817B89]">
                  Pronto! O ícone do ALTTO será fixado na tela inicial e gaveta de apps, abrindo em tela cheia como um aplicativo nativo da Play Store.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-[#292532]">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Abra no navegador Safari</span>
                <p className="text-[11px] text-[#817B89]">
                  No iPhone e iPad, a adição de ícones à tela inicial deve ser feita pelo Safari.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Toque no botão Compartilhar</span>
                <p className="text-[11px] text-[#817B89]">
                  É o ícone quadrado com uma seta para cima <Share2 className="w-3.5 h-3.5 inline text-[#77619E]" /> na barra inferior do Safari.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-[#EEEAF5]">
              <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] text-[#77619E] flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold block">Role e toque em &ldquo;Adicionar à Tela de Início&rdquo;</span>
                <p className="text-[11px] text-[#817B89]">
                  Procure a opção com o ícone <PlusSquare className="w-3.5 h-3.5 inline text-[#77619E]" /> e confirme em <strong>Adicionar</strong> no topo direito.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#EEEAF5] text-[11px] text-[#817B89]">
          <span>Ícones configurados para alta resolução (Retina / OLED)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#77619E] text-white text-xs font-medium hover:bg-[#68538D] transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
