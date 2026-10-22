import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

import { toast, Toaster } from 'react-hot-toast';

// Google Maps global error handler for billing/API key issues
(window as any).gm_authFailure = () => {
  console.error("Google Maps Authentication Failure: This usually indicates that billing is not enabled or the API key is invalid.");
  toast.error("Map feature unavailable: Google Maps billing is not enabled for this project.", {
    duration: 6000,
    position: 'bottom-center'
  });
};

import { HelmetProvider } from 'react-helmet-async';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <App />
          <Toaster />
        </HelmetProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

<button>
  Click me
</button>