/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { StorefrontView } from './components/StorefrontView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { OfflineIndicator } from './components/OfflineIndicator';

const MainRouter: React.FC = () => {
  const [mode, setMode] = useState<'STOREFRONT' | 'ADMIN'>(() => {
    try {
      const saved = localStorage.getItem('atelier_app_mode');
      if (saved === 'ADMIN' || saved === 'STOREFRONT') return saved;
      if (typeof window !== 'undefined' && window.location.hash === '#admin') return 'ADMIN';
    } catch {}
    return 'STOREFRONT';
  });
  const [adminInitialTab, setAdminInitialTab] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('atelier_admin_tab') || 'PRODUCTS';
    } catch {
      return 'PRODUCTS';
    }
  });
  const [autoOpenNewProduct, setAutoOpenNewProduct] = useState(false);
  const { toastMessage } = useStore();

  const handleSwitchMode = (newMode: 'STOREFRONT' | 'ADMIN') => {
    setMode(newMode);
    try {
      localStorage.setItem('atelier_app_mode', newMode);
      if (typeof window !== 'undefined') {
        window.location.hash = newMode === 'ADMIN' ? '#admin' : '#store';
      }
    } catch {}
  };

  return (
    <div className="relative min-h-screen">
      {mode === 'STOREFRONT' ? (
        <StorefrontView
          onOpenAdmin={(tab?: string, openNewProduct?: boolean) => {
            const chosenTab = tab || 'PRODUCTS';
            setAdminInitialTab(chosenTab);
            try {
              localStorage.setItem('atelier_admin_tab', chosenTab);
            } catch {}
            setAutoOpenNewProduct(Boolean(openNewProduct));
            handleSwitchMode('ADMIN');
          }}
        />
      ) : (
        <AdminDashboardView
          initialTab={adminInitialTab as any}
          autoOpenNewProduct={autoOpenNewProduct}
          onReturnToStore={() => {
            handleSwitchMode('STOREFRONT');
            setAutoOpenNewProduct(false);
          }}
        />
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-5 py-3 bg-[#141413] text-[#FBFBF9] border border-white/15 text-xs font-medium shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <MainRouter />
    </StoreProvider>
  );
}
