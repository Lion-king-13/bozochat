import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { AppHome } from './pages/AppHome';
import { AuthPage } from './pages/AuthPage';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/app/*" element={<AppHome />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
