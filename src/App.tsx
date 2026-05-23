import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { MainContent } from './components/MainContent';
import { CollapsibleSidebar } from './components/CollapsibleSidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingFallback } from './components/LoadingFallback';
import { initializeTheme } from './services/themeService';
import { GitHubAuthProvider } from './contexts/GitHubAuthContext';
import styles from './App.module.css';

const GalleryPage = lazy(() => import('./pages/GalleryPage/GalleryPage').then(m => ({ default: m.GalleryPage })));
const AppLaunchPage = lazy(() => import('./pages/AppLaunchPage/AppLaunchPage').then(m => ({ default: m.AppLaunchPage })));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage/UpdatesPage').then(m => ({ default: m.UpdatesPage })));
const ContentUploadPage = lazy(() => import('./pages/ContentUploadPage/ContentUploadPage').then(m => ({ default: m.ContentUploadPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage/StatisticsPage').then(m => ({ default: m.StatisticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

initializeTheme();

function AppShell() {
  return (
    <div className={styles.appShell}>
      <Header />
      <div className={styles.body}>
        <MainContent>
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/gallery" replace />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/apps/:id" element={<AppLaunchPage />} />
                <Route path="/updates" element={<UpdatesPage />} />
                <Route path="/content" element={<ContentUploadPage />} />
                <Route path="/statistics" element={<StatisticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </MainContent>
        <CollapsibleSidebar />
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <GitHubAuthProvider>
        <AppShell />
      </GitHubAuthProvider>
    </BrowserRouter>
  );
}

export default App;
