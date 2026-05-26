import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { MainContent } from './components/MainContent';
import { CollapsibleSidebar } from './components/CollapsibleSidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingFallback } from './components/LoadingFallback';
import { RequireAuth } from './components/RequireAuth/RequireAuth';
import { initializeTheme } from './services/themeService';
import { GitHubAuthProvider } from './contexts/GitHubAuthContext';
import styles from './App.module.css';

const AppsPage = lazy(() => import('./pages/AppsPage/AppsPage').then(m => ({ default: m.AppsPage })));
const GalleryPage = lazy(() => import('./pages/GalleryPage/GalleryPage').then(m => ({ default: m.GalleryPage })));
const AppLaunchPage = lazy(() => import('./pages/AppLaunchPage/AppLaunchPage').then(m => ({ default: m.AppLaunchPage })));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage/UpdatesPage').then(m => ({ default: m.UpdatesPage })));
const ContentUploadPage = lazy(() => import('./pages/ContentUploadPage/ContentUploadPage').then(m => ({ default: m.ContentUploadPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage/StatisticsPage').then(m => ({ default: m.StatisticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const MyProjectsPage = lazy(() => import('./pages/MyProjectsPage/MyProjectsPage').then(m => ({ default: m.MyProjectsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const HelpPage = lazy(() => import('./pages/HelpPage/HelpPage').then(m => ({ default: m.HelpPage })));
const VipPage = lazy(() => import('./pages/VipPage/VipPage').then(m => ({ default: m.VipPage })));

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
                {/* Public */}
                <Route path="/gallery" element={<AppsPage />} />
                <Route path="/apps/:id" element={<AppLaunchPage />} />
                {/* Auth-gated */}
                <Route path="/projects" element={<RequireAuth><GalleryPage /></RequireAuth>} />
                <Route path="/projects/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
                <Route path="/updates" element={<RequireAuth><UpdatesPage /></RequireAuth>} />
                <Route path="/content" element={<RequireAuth><ContentUploadPage /></RequireAuth>} />
                <Route path="/statistics" element={<RequireAuth><StatisticsPage /></RequireAuth>} />
                <Route path="/my-projects" element={<RequireAuth><MyProjectsPage /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="/help" element={<HelpPage />} />
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
        <Suspense fallback={null}>
          <Routes>
            {/* VIP links render outside AppShell — no portal chrome */}
            <Route path="/vip/:token" element={<VipPage />} />
            <Route path="*" element={<AppShell />} />
          </Routes>
        </Suspense>
      </GitHubAuthProvider>
    </BrowserRouter>
  );
}

export default App;
