import React from 'react';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { AuthScreen } from './components/AuthScreen';
import { Shell } from './components/Shell';
import { Overlays } from './components/Overlays';
import { canAccessAdminRoute } from './lib/scan2printAdmin';
import { OverviewPage } from './pages/OverviewPage';
import { BusinessCmsPage } from './pages/BusinessCmsPage';
import { CatalogCmsPage } from './pages/CatalogCmsPage';
import { EngagementCmsPage } from './pages/EngagementCmsPage';
import { EnquiriesPage } from './pages/EnquiriesPage';
import { BiharUpdatesPage } from './pages/BiharUpdatesPage';
import { AccessAuditPage } from './pages/AccessAuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';
import { HardwareAuditPage } from './pages/HardwareAuditPage';

const ActiveRouteView: React.FC = () => {
  const { route } = useAdmin();

  switch (route.main) {
    case 'home':
      return <OverviewPage />;
    case 'hardware':
      return <HardwareAuditPage />;
    case 'cms':
      if (route.sub === 'services' || route.sub === 'gallery') {
        return <CatalogCmsPage />;
      }
      if (route.sub === 'testimonials' || route.sub === 'faqs') {
        return <EngagementCmsPage />;
      }
      return <BusinessCmsPage />;
    case 'enquiries':
      return <EnquiriesPage />;
    case 'bihar-updates':
      return <BiharUpdatesPage />;
    case 'access':
      return <AccessAuditPage />;
    case 'settings':
      return <SettingsPage />;
    case 'help':
      return <HelpPage />;
    default:
      return <OverviewPage />;
  }
};

const RootGate: React.FC = () => {
  const { authLoading, currentUser, appearance } = useAdmin();

  if (authLoading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-6 text-[var(--ink)]">
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <img
            src={`/photos/wallpapers/${appearance.wallpaper}.jpg`}
            alt=""
            className="w-full h-full object-cover scale-[1.02]"
            style={{ filter: 'var(--wall-filter)' }}
          />
          <div className="absolute inset-0" style={{ background: 'var(--wash)' }} />
        </div>
        <div className="glass-solid rounded-[24px] px-6 py-4 text-[14px] font-semibold">
          Loading AMAN COMPUTER Admin Dashboard...
        </div>
      </div>
    );
  }

  if (!canAccessAdminRoute(currentUser)) {
    return (
      <>
        <AuthScreen />
        <Overlays />
      </>
    );
  }

  return (
    <>
      <Shell>
        <ActiveRouteView />
      </Shell>
      <Overlays />
    </>
  );
};

export default function App() {
  return (
    <AdminProvider>
      <RootGate />
    </AdminProvider>
  );
}
