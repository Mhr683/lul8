import React, { useState } from 'react';
import { Download, Laptop, Smartphone, Apple, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'pill' | 'footer';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isDesktop, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setModalOpen(true);
      }
    } else {
      setModalOpen(true);
    }
  };

  // Get device icon
  const DeviceIcon = isIOS ? Apple : isAndroid ? Smartphone : Laptop;
  const deviceLabel = isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : 'PC / Laptop';

  if (variant === 'banner') {
    if (isInstalled) return null;
    return (
      <>
        <div className={`bg-[#141413] text-[#FBFBF9] py-2 px-4 flex items-center justify-between text-xs border-b border-white/10 ${className}`}>
          <div className="flex items-center gap-2 truncate">
            <DeviceIcon className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
            <span className="truncate">
              Install <strong>Atelier Aurelia</strong> on your {deviceLabel} for 1-tap offline luxury shopping
            </span>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="ml-3 px-3 py-1 bg-[#C5A059] hover:bg-[#D4B36D] text-[#0B0F17] rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-3 h-3" />
            <span>Install App</span>
          </button>
        </div>
        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  if (variant === 'footer') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors cursor-pointer ${className}`}
        >
          <DeviceIcon className="w-3.5 h-3.5 text-[#C5A059]" />
          <span>{isInstalled ? '✓ Atelier App Installed' : `Install on ${deviceLabel}`}</span>
        </button>
        <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  // Header button (default)
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
          isInstalled
            ? 'bg-black/5 text-[#141413]/70 hover:bg-black/10 border border-black/10'
            : 'bg-[#C5A059]/15 hover:bg-[#C5A059]/25 text-[#73541B] border border-[#C5A059]/40'
        } ${className}`}
        title={`Install Atelier Aurelia on ${deviceLabel}`}
      >
        <DeviceIcon className="w-3.5 h-3.5 text-[#855B14] shrink-0" />
        <span className="hidden sm:inline">
          {isInstalled ? 'Installed' : 'Install App'}
        </span>
        {!isInstalled && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse"></span>
        )}
      </button>
      <PWAInstallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
