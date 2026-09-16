import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

interface OfflineIndicatorProps {
  lang: 'es' | 'en';
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ lang }) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  const t = (es: string, en: string) => (lang === 'es' ? es : en);

  if (!isOnline) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:right-auto md:max-w-md z-50 flex items-center gap-3 rounded-xl bg-amber-950/90 border border-amber-500/40 px-4 py-3 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md animate-bounce">
        <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="font-bold text-amber-300">
            {t('Sin conexión a Internet', 'No Internet Connection')}
          </p>
          <p className="text-[11px] text-amber-200/80 font-sans">
            {t('Mostrando datos en caché. La conexión se restablecerá automáticamente.', 'Displaying cached data. Will reconnect automatically.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:right-auto md:max-w-md z-50 flex items-center gap-2 rounded-xl bg-lime-950/90 border border-lime-500/40 px-4 py-2.5 text-xs font-semibold text-lime-200 shadow-2xl backdrop-blur-md">
      <Wifi className="w-4 h-4 text-lime-400 shrink-0" />
      <span>{t('Conexión restablecida', 'Connection restored')}</span>
    </div>
  );
};
