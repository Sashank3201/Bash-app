import { AnimatePresence, MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './screens/shell/AppShell';
import { Toasts } from './design/ui';
import { useApp } from './store/app';

const Onboarding = lazy(() => import('./screens/onboarding/Onboarding'));
const Today = lazy(() => import('./screens/today/Today'));
const PathScreen = lazy(() => import('./screens/path/PathScreen'));
const MissionPlayer = lazy(() => import('./screens/mission/MissionPlayer'));
const CaseView = lazy(() => import('./screens/case/CaseView'));
const ChallengeView = lazy(() => import('./screens/arena/ChallengeView'));
const Lab = lazy(() => import('./screens/lab/Lab'));
const Review = lazy(() => import('./screens/review/Review'));
const Reference = lazy(() => import('./screens/reference/Reference'));
const Dossier = lazy(() => import('./screens/dossier/Dossier'));
const Certificate = lazy(() => import('./screens/dossier/Certificate'));

function useTheme() {
  const theme = useApp((s) => s.settings.theme);
  const fontScale = useApp((s) => s.settings.fontScale);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t === 'dark' ? '#1A1816' : '#F6F3EC'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [fontScale]);
}

function Loading() {
  return <div style={{ minHeight: '60dvh' }} aria-busy="true" />;
}

export function App() {
  useTheme();
  const location = useLocation();
  const onboarded = useApp((s) => s.profile.onboarded);
  const fullscreen = /^\/(mission|case|arena|welcome|certificate)/.test(location.pathname);
  const touch = useApp((s) => s.touch);
  useEffect(() => {
    if (onboarded) touch();
  }, [onboarded, touch]);

  const routes = (
    <Suspense fallback={<Loading />}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname.split('/').slice(0, 2).join('/')}>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={onboarded ? <Today /> : <Navigate to="/welcome" replace />} />
          <Route path="/path" element={<PathScreen />} />
          <Route path="/mission/:day" element={<MissionPlayer />} />
          <Route path="/case/:id" element={<CaseView />} />
          <Route path="/arena/:id" element={<ChallengeView />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/review" element={<Review />} />
          <Route path="/reference" element={<Reference />} />
          <Route path="/reference/:name" element={<Reference />} />
          <Route path="/dossier" element={<Dossier />} />
          <Route path="/certificate" element={<Certificate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );

  return (
    <MotionConfig reducedMotion="user">
      {fullscreen ? routes : <AppShell>{routes}</AppShell>}
      <Toasts />
    </MotionConfig>
  );
}
