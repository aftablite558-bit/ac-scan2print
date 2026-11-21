import React from 'react';
import { PortalLayout } from './components/PortalLayout';
import { PortalProvider, usePortal } from './context/PortalContext';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { HelpPage } from './pages/HelpPage';
import { OptionsAndPaymentPage } from './pages/OptionsAndPaymentPage';
import { PrintHomePage } from './pages/PrintHomePage';
import { TrackingPage } from './pages/TrackingPage';
import { UploadPage } from './pages/UploadPage';

const ActiveCustomerScreen: React.FC = () => {
  const { route } = usePortal();

  switch (route) {
    case '/quick-print':
      return <PrintHomePage />;
    case '/quick-print/upload':
      return <UploadPage />;
    case '/quick-print/options':
      return <OptionsAndPaymentPage />;
    case '/quick-print/success':
      return <ConfirmationPage />;
    case '/quick-print/track':
      return <TrackingPage />;
    case '/quick-print/help':
      return <HelpPage />;
  }
};

export default function App() {
  return (
    <PortalProvider>
      <PortalLayout>
        <ActiveCustomerScreen />
      </PortalLayout>
    </PortalProvider>
  );
}
