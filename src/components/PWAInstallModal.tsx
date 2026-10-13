import React, { useState, useEffect } from 'react';
import {
  Download,
  Laptop,
  Smartphone,
  Apple,
  CheckCircle2,
  X,
  Share,
  PlusSquare,
  Sparkles,
  Zap,
  WifiOff,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'desktop' | 'android' | 'ios';
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  defaultTab,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isDesktop, install } = usePWAInstall();

  // Set active tab based on detected platform or prop
  const [activeTab, setActiveTab] = useState<'desktop' | 'android' | 'ios'>('desktop');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (isIOS) {
      setActiveTab('ios');
    } else if (isAndroid) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }
  }, [defaultTab, isIOS, isAndroid, isDesktop, isOpen]);

  const handleInstallClick = async () => {
    setIsInstalling(true);
    const success = await install();
    setIsInstalling(false);
    if (success) {
      setInstallSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2500);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Atelier Aurelia App"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[#FBFBF9] text-[#141413] w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-black/15 rounded-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#141413] text-[#FBFBF9] px-5 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C5A059]/20 border border-[#C5A059]/40 flex items-center justify-center text-[#EED9A8] shrink-0 font-display font-bold text-base">
              AA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-base sm:text-lg tracking-tight">
                  Install Atelier Aurelia App
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/30">
                  Universal PWA
                </span>
              </div>
              <p className="text-[11px] text-white/60">
                Laptop · PC · Android · iPhone · iPad — 1-Tap Offline Ready
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Detection Alert Banner */}
        <div className="bg-amber-50/80 border-b border-amber-200/60 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              <strong>Detected System:</strong>{' '}
              {isIOS
                ? 'Apple iPhone / iPad (iOS)'
                : isAndroid
                ? 'Android Mobile / Tablet'
                : 'Laptop / Desktop PC'}
            </span>
          </div>

          {isInstalled && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Installed
            </span>
          )}
        </div>

        {/* 3 Platform Tabs */}
        <div className="bg-[#F0EFEA] border-b border-black/10 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                : 'text-[#141413]/70 hover:text-[#141413] hover:bg-black/5'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Laptop &amp; PC</span>
            {isDesktop && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-[#141413]/70 hover:text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android Mobile</span>
            {isAndroid && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                : 'text-[#141413]/70 hover:text-[#141413] hover:bg-black/5'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iPhone &amp; iPad</span>
            {isIOS && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#FBFBF9]">
          {installSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-display font-semibold text-[#141413]">
                App Successfully Installed!
              </h4>
              <p className="text-xs text-black/60 max-w-sm mx-auto">
                Atelier Aurelia is now added to your system applications. You can launch it
                anytime from your desktop or home screen!
              </p>
            </div>
          ) : (
            <>
              {/* TAB 1: LAPTOP & PC */}
              {activeTab === 'desktop' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-black/10 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-sm text-[#141413] flex items-center gap-2">
                          <Laptop className="w-4 h-4 text-[#C5A059]" />
                          <span>Windows PC, Mac &amp; Linux Desktop</span>
                        </h4>
                        <p className="text-xs text-black/60 mt-1">
                          Installs as a dedicated standalone desktop app with full keyboard shortcuts,
                          system window frame, and offline catalog browsing.
                        </p>
                      </div>
                    </div>

                    {isInstallable ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleInstallClick}
                          disabled={isInstalling}
                          className="w-full py-3 bg-[#141413] hover:bg-[#2A2A28] text-[#FBFBF9] rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4 text-emerald-400" />
                          <span>{isInstalling ? 'Installing...' : '1-Click Install on PC / Laptop'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <div className="p-3 bg-[#F4F3EE] rounded-lg text-xs space-y-2 border border-black/10">
                          <div className="font-medium text-[#141413]">How to install on Laptop / Desktop:</div>
                          <ol className="list-decimal list-inside space-y-1.5 text-black/70 text-[11px] leading-relaxed">
                            <li>
                              In your browser address bar (top right), click the{' '}
                              <strong>Install App icon (⊞ or ⬇)</strong>.
                            </li>
                            <li>
                              Or click the browser menu <strong>(⋮ or ⋯)</strong> &gt;{' '}
                              <strong>&quot;Install Atelier Aurelia&quot;</strong>.
                            </li>
                            <li>
                              Click <strong>&quot;Install&quot;</strong> to place an icon on your Desktop &amp; Start menu.
                            </li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white border border-black/10 rounded-lg flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Instant Startup</div>
                        <div className="text-[10px] text-black/50">Launches in &lt; 0.5s from desktop</div>
                      </div>
                    </div>
                    <div className="p-3 bg-white border border-black/10 rounded-lg flex items-center gap-2.5">
                      <WifiOff className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Offline Resilient</div>
                        <div className="text-[10px] text-black/50">Cached catalog &amp; assets</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ANDROID MOBILE */}
              {activeTab === 'android' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-black/10 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-sm text-[#141413] flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                          <span>Android Mobile &amp; Tablet (WebAPK)</span>
                        </h4>
                        <p className="text-xs text-black/60 mt-1">
                          Samsung Galaxy, Xiaomi, Oppo, Vivo, OnePlus, Google Pixel aur tamam Android devices par
                          native app ki tarah install hoti hai.
                        </p>
                      </div>
                    </div>

                    {isInstallable ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleInstallClick}
                          disabled={isInstalling}
                          className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4 text-emerald-300" />
                          <span>{isInstalling ? 'Installing...' : 'Install on Android Phone'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-2 text-emerald-950">
                        <div className="font-semibold flex items-center gap-1.5">
                          <span>Android Installation Guide:</span>
                        </div>
                        <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed">
                          <li>
                            Chrome browser me top-right par <strong>3 dots (⋮)</strong> tap karein.
                          </li>
                          <li>
                            Menu me <strong>&quot;Install app&quot;</strong> ya <strong>&quot;Add to Home screen&quot;</strong> select karein.
                          </li>
                          <li>
                            <strong>&quot;Install&quot;</strong> par tap karein. App aapke mobile app drawer me add ho jayegi!
                          </li>
                        </ol>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white border border-black/10 rounded-lg flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Safe &amp; Compact</div>
                        <div className="text-[10px] text-black/50">Less than 5MB storage used</div>
                      </div>
                    </div>
                    <div className="p-3 bg-white border border-black/10 rounded-lg flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-semibold text-[#141413]">Full Screen View</div>
                        <div className="text-[10px] text-black/50">No browser address bar</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: IPHONE & IPAD */}
              {activeTab === 'ios' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-black/10 rounded-xl space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-sm text-[#141413] flex items-center gap-2">
                          <Apple className="w-4 h-4 text-[#141413]" />
                          <span>Apple iPhone &amp; iPad (iOS Safari)</span>
                        </h4>
                        <p className="text-xs text-black/60 mt-1">
                          Apple iOS policy requires adding via Safari Share sheet. Follow these 3 easy steps:
                        </p>
                      </div>
                    </div>

                    {/* Step-by-step visual Apple Guide */}
                    <div className="space-y-2.5 pt-1">
                      <div className="p-3 bg-[#FBFBF9] border border-black/10 rounded-lg flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#141413] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          1
                        </div>
                        <div className="text-xs text-black/80 flex-1">
                          Safari toolbar ke bottom (ya top) par <strong>Share button</strong> tap karein:
                          <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-black/5 border border-black/10 font-mono text-[10px]">
                            <Share className="w-3 h-3 text-[#141413] inline" /> Share
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#FBFBF9] border border-black/10 rounded-lg flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#141413] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          2
                        </div>
                        <div className="text-xs text-black/80 flex-1">
                          Scroll down karein aur <strong>&quot;Add to Home Screen&quot;</strong> select karein:
                          <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-black/5 border border-black/10 font-mono text-[10px]">
                            <PlusSquare className="w-3 h-3 text-[#141413] inline" /> Add to Home Screen
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#FBFBF9] border border-black/10 rounded-lg flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#141413] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          3
                        </div>
                        <div className="text-xs text-black/80 flex-1">
                          Top right corner par <strong>&quot;Add&quot;</strong> tap karein. Atelier icon aapke iPhone screen par App Store app ki tarah appear ho jayega!
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-lg text-xs text-amber-950 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Runs with zero Safari address bars and full-screen luxury animation on iOS!
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#F0EFEA] border-t border-black/10 px-5 py-3 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-black/60 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Progressive Web App · Auto Sync &amp; Updates</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141413] text-[#FBFBF9] rounded text-xs font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
