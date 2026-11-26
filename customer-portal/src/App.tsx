import React from 'react';
import { PortalLayout } from './components/PortalLayout';
import { PortalProvider, usePortal } from './context/PortalContext';
import { BatchPackPage } from './pages/BatchPackPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ExamPrepPage } from './pages/ExamPrepPage';
import { HelpPage } from './pages/HelpPage';
import { KioskPage } from './pages/KioskPage';
import { OptionsAndPaymentPage } from './pages/OptionsAndPaymentPage';
import { PhotoSheetPage } from './pages/PhotoSheetPage';
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
    case '/quick-print/kiosk':
      return <KioskPage />;
    case '/quick-print/photo-sheet':
      return <PhotoSheetPage />;
    case '/quick-print/exam-prep':
      return <ExamPrepPage />;
    case '/quick-print/batch-pack':
      return <BatchPackPage />;
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
