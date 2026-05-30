import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { MainContent } from './components/MainContent';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingFallback } from './components/LoadingFallback';
import { RequireAuth } from './components/RequireAuth/RequireAuth';
import { initializeTheme } from './services/themeService';
import { GitHubAuthProvider } from './contexts/GitHubAuthContext';
import { useGitHubAuth } from './contexts/useGitHubAuth';
import styles from './App.module.css';

const LandingPage    = lazy(() => import('./pages/LandingPage/LandingPage').then(m => ({ default: m.LandingPage })));
const DeployPage     = lazy(() => import('./pages/DeployPage/DeployPage').then(m => ({ default: m.DeployPage })));
const AppsPage       = lazy(() => import('./pages/AppsPage/AppsPage').then(m => ({ default: m.AppsPage })));
const AppLaunchPage  = lazy(() => import('./pages/AppLaunchPage/AppLaunchPage').then(m => ({ default: m.AppLaunchPage })));
const GalleryPage    = lazy(() => import('./pages/GalleryPage/GalleryPage').then(m => ({ default: m.GalleryPage })));
const UpdatesPage    = lazy(() => import('./pages/UpdatesPage/UpdatesPage').then(m => ({ default: m.UpdatesPage })));
const ContentUploadPage = lazy(() => import('./pages/ContentUploadPage/ContentUploadPage').then(m => ({ default: m.ContentUploadPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage/StatisticsPage').then(m => ({ default: m.StatisticsPage })));
const SettingsPage   = lazy(() => import('./pages/SettingsPage/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const NotFoundPage   = lazy(() => import('./pages/NotFoundPage/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const HelpPage       = lazy(() => import('./pages/HelpPage/HelpPage').then(m => ({ default: m.HelpPage })));
const VipPage        = lazy(() => import('./pages/VipPage/VipPage').then(m => ({ default: m.VipPage })));

initializeTheme();

function HomeRedirect() {
  const { user, loading } = useGitHubAuth();
  if (loading) return <LoadingFallback />;
  return user ? <Navigate to="/deploy" replace /> : <LandingPage />;
}

function AppShell() {
  return (
    <div className={styles.appShell}>
      <Header />
      <MainContent>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/apps"        element={<AppsPage />} />
              <Route path="/apps/:id"    element={<AppLaunchPage />} />
              <Route path="/help"        element={<HelpPage />} />
              {/* Auth-gated — core */}
              <Route path="/deploy"      element={<RequireAuth><DeployPage /></RequireAuth>} />
              {/* Legacy redirect */}
              <Route path="/my-projects" element={<Navigate to="/deploy" replace />} />
              {/* Auth-gated — secondary */}
              <Route path="/gallery"     element={<Navigate to="/apps" replace />} />
              <Route path="/projects"    element={<RequireAuth><GalleryPage /></RequireAuth>} />
              <Route path="/projects/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
              <Route path="/updates"     element={<RequireAuth><UpdatesPage /></RequireAuth>} />
              <Route path="/content"     element={<RequireAuth><ContentUploadPage /></RequireAuth>} />
              <Route path="/statistics"  element={<RequireAuth><StatisticsPage /></RequireAuth>} />
              <Route path="/settings"    element={<RequireAuth><SettingsPage /></RequireAuth>} />
              <Route path="*"            element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </MainContent>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <GitHubAuthProvider>
        <Suspense fallback={null}>
          <Routes>
            {/* VIP links — fullscreen, no portal chrome */}
            <Route path="/vip/:token" element={<VipPage />} />
            {/* Landing at root — redirects to /deploy if logged in */}
            <Route path="/" element={<HomeRedirect />} />
            {/* All other routes use AppShell with header */}
            <Route path="*" element={<AppShell />} />
          </Routes>
        </Suspense>
      </GitHubAuthProvider>
    </BrowserRouter>
  );
}

export default App;
