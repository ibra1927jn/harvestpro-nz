/**
 * ROUTES.TSX - Configuración Blindada + Code Splitting
 */
import React, { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { translate } from '@/i18n';
import { Role } from './types';
import ErrorBoundary from './components/common/ErrorBoundary';
import { HarvestSyncBridge } from './components/common/HarvestSyncBridge';
import { StoragePersistBanner } from './components/common/StoragePersistBanner';
import { OrchardDataBootstrap } from './components/common/OrchardDataBootstrap';

// ── Lazy-loaded pages (code splitting) ─────────
const Login = React.lazy(() => import('./pages/Login'));
const TeamLeader = React.lazy(() => import('./pages/TeamLeader'));
const Runner = React.lazy(() => import('./pages/Runner'));
const Manager = React.lazy(() => import('./pages/Manager'));
const QualityControl = React.lazy(() => import('./pages/QualityControl'));
const Admin = React.lazy(() => import('./pages/Admin'));
const HHRR = React.lazy(() => import('./pages/HHRR'));
const LogisticsDept = React.lazy(() => import('./pages/LogisticsDept'));
const Payroll = React.lazy(() => import('./pages/Payroll'));
const OnboardingPage = React.lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));

// ── Loading fallback ───────────────────────────
/** Shared full-page loader — used by Suspense boundaries and ProtectedRoute */
const PageLoader = () => (
  <div
    className="h-screen flex items-center justify-center bg-slate-50"
    role="status"
    aria-live="polite"
    aria-label={translate('ui.loading_app')}
  >
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
      <p className="text-slate-500 text-sm font-medium">{translate('common.loading')}</p>
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{ allowedRoles?: Role[] }> = ({ allowedRoles }) => {
  const { isAuthenticated, appUser, isLoading } = useAuth();
  // Casting seguro del rol
  const currentRole = appUser?.role as Role;

  if (isLoading) return <PageLoader />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Si tiene rol pero intenta entrar donde no debe (Seguridad entre departamentos)
  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    const roleRoutes: Record<string, string> = {
      [Role.MANAGER]: '/manager',
      [Role.TEAM_LEADER]: '/team-leader',
      [Role.RUNNER]: '/runner',
      [Role.QC_INSPECTOR]: '/qc',
      [Role.PAYROLL_ADMIN]: '/payroll',
      [Role.HR_ADMIN]: '/hhrr',
      [Role.LOGISTICS]: '/logistics-dept',
    };
    // Lo mandamos a su casa correcta
    return <Navigate to={roleRoutes[currentRole] || '/'} replace />;
  }

  return (
    <>
      <OrchardDataBootstrap />
      <HarvestSyncBridge />
      <StoragePersistBanner />
      <Outlet />
    </>
  );
};

// Redirección inteligente para la raíz "/"
export const RootRedirect: React.FC = () => {
  const { isAuthenticated, appUser, isLoading } = useAuth();
  const currentRole = appUser?.role as Role;

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Mapa de redirección automática
  switch (currentRole) {
    case Role.MANAGER:
      return <Navigate to="/manager" replace />;
    case Role.TEAM_LEADER:
      return <Navigate to="/team-leader" replace />;
    case Role.RUNNER:
      return <Navigate to="/runner" replace />;
    case Role.QC_INSPECTOR:
      return <Navigate to="/qc" replace />;
    case Role.PAYROLL_ADMIN:
      return <Navigate to="/payroll" replace />;
    case Role.ADMIN:
      return <Navigate to="/admin" replace />;
    case Role.HR_ADMIN:
      return <Navigate to="/hhrr" replace />;
    case Role.LOGISTICS:
      return <Navigate to="/logistics-dept" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: '/signup',
    element: (
      <Suspense fallback={<PageLoader />}>
        <OnboardingPage />
      </Suspense>
    ),
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.MANAGER]} />,
    children: [
      {
        path: '/manager',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Manager />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.TEAM_LEADER]} />,
    children: [
      {
        path: '/team-leader',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <TeamLeader />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.RUNNER]} />,
    children: [
      {
        path: '/runner',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Runner />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.MANAGER, Role.QC_INSPECTOR]} />,
    children: [
      {
        path: '/qc',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <QualityControl />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.ADMIN]} />,
    children: [
      {
        path: '/admin',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Admin />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.HR_ADMIN, Role.ADMIN]} />,
    children: [
      {
        path: '/hhrr',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <HHRR />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.LOGISTICS, Role.MANAGER]} />,
    children: [
      {
        path: '/logistics-dept',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <LogisticsDept />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={[Role.PAYROLL_ADMIN, Role.MANAGER]} />,
    children: [
      {
        path: '/payroll',
        element: (
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Payroll />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
