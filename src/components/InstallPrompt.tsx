import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Check } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  lang: 'es' | 'en';
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({ lang }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || dismissed) return null;
  if (!isInstallable && !isIOS) return null;

  const t = (es: string, en: string) => (lang === 'es' ? es : en);

  return (
    <>
      {/* Floating or Top Install Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-lime-950/40 border border-lime-500/30 rounded-xl p-3 shadow-2xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-lime-500/10 border border-lime-500/30 flex items-center justify-center text-lime-400 shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>{t('Instalar App en tu Móvil', 'Install App on Mobile')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-lime-500/20 text-lime-400 font-mono">PWA</span>
            </p>
            <p className="text-[11px] text-slate-400 font-sans">
              {t('Acceso directo en pantalla de inicio, 24/7 y sin barra de navegador.', 
                 'Home screen shortcut, fullscreen standalone experience 24/7.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 active:scale-95 text-slate-950 font-black rounded-lg transition-all flex items-center gap-1 shadow-lg shadow-lime-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('INSTALAR', 'INSTALL')}</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-slate-500 hover:text-slate-300 rounded"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari instructions modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-lime-400 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                {t('Instalar en iPhone / iPad', 'Install on iOS')}
              </h3>
              <button onClick={() => setShowIOSGuide(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-3 text-xs text-slate-300 font-sans list-decimal list-inside leading-relaxed">
              <li>
                {t('Toca el botón ', 'Tap the ')}
                <strong className="text-white">Compartir (Share)</strong> 
                {t(' en la barra inferior de Safari.', ' icon in Safari bottom bar.')}
              </li>
              <li>
                {t('Desplázate hacia abajo y selecciona ', 'Scroll down and select ')}
                <strong className="text-lime-400">"Agregar a Inicio" (Add to Home Screen)</strong>.
              </li>
              <li>
                {t('Toca ', 'Tap ')}
                <strong className="text-white">"Agregar" (Add)</strong>
                {t(' en la esquina superior derecha.', ' on top right.')}
              </li>
            </ol>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition-colors"
            >
              {t('Entendido', 'Got it')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
