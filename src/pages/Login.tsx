/**
 * Login Page — Auth entry point
 *
 * Refactored architecture:
 *   Login.tsx                  — Orchestrator (~170 lines)
 *   useLoginAnimations.ts     — Typewriter, counter, parallax hooks
 *   auth/login/
 *     ├── HeroPanel.tsx       — Left hero with parallax + animations
 *     ├── Decorations.tsx     — SVG decorations (VineLeaf, GrapeCluster, ParticleDots)
 *     └── index.ts            — Barrel export
 *   auth/LoginForm.tsx        — (existing) Login form fields
 *   auth/RegisterForm.tsx     — (existing) Register form fields
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/utils/logger';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import { HeroPanel } from '@/components/auth/login';
import { useTranslation } from '@/i18n';
import { authErrorText } from '@/i18n/authErrorText';
import { inviteEmailFromSearch } from '@/components/common/invitations/invitationLogic';

type AuthMode = 'LOGIN' | 'REGISTER';

const DASHBOARD_ROUTES: Record<Role, string> = {
  [Role.MANAGER]: '/manager',
  [Role.TEAM_LEADER]: '/team-leader',
  [Role.RUNNER]: '/runner',
  [Role.QC_INSPECTOR]: '/qc',
  [Role.PAYROLL_ADMIN]: '/payroll',
  [Role.ADMIN]: '/admin',
  [Role.HR_ADMIN]: '/hhrr',
  [Role.LOGISTICS]: '/logistics-dept',
};

const Login: React.FC = () => {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword, isLoading, isAuthenticated, currentRole } = useAuth();
  const navigate = useNavigate();

  // Enlace de invitación (/login?invite=email): abre «Registrarse» con el email puesto
  const [inviteEmail] = useState(() =>
    typeof window !== 'undefined' ? inviteEmailFromSearch(window.location.search) : null
  );
  const [mode, setMode] = useState<AuthMode>(inviteEmail ? 'REGISTER' : 'LOGIN');
  const [email, setEmail] = useState(inviteEmail ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [tabKey, setTabKey] = useState(0);

  useEffect(() => {
    if (isAuthenticated && currentRole) {
      navigate(DASHBOARD_ROUTES[currentRole], { replace: true });
    }
  }, [isAuthenticated, currentRole, navigate]);

  const triggerShake = useCallback(() => setShakeKey(k => k + 1), []);
  const switchTab = useCallback((newMode: AuthMode) => {
    setMode(newMode); setError(''); setSuccess(''); setTabKey(k => k + 1);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess(''); setIsSubmitting(true);
    try {
      await signIn(email, password);
      // Navegación delegada al useEffect — dispara cuando isAuthenticated + currentRole estén listos.
      // Evita la race condition donde signIn devuelve profile=null mientras onAuthStateChange
      // aún está cargando el perfil en paralelo.
    } catch (err: unknown) {
      setError(err instanceof Error ? authErrorText(t, err.message) : t('login.failed'));
      triggerShake(); logger.error(err);
    } finally { setIsSubmitting(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess(''); setIsSubmitting(true);
    try {
      await signUp(email, password, fullName);
      setSuccess(`✅ ${t('login.account_created')}`);
      setMode('LOGIN'); setEmail(''); setPassword(''); setFullName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? authErrorText(t, err.message) : t('login.register_failed'));
      triggerShake(); logger.error(err);
    } finally { setIsSubmitting(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { setError(t('login.email_first')); triggerShake(); return; }
    setError(''); setIsSubmitting(true);
    try {
      await resetPassword(email);
      setSuccess(`📧 ${t('login.recovery_sent')}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? authErrorText(t, err.message) : t('login.email_failed'));
      triggerShake(); logger.error(err);
    } finally { setIsSubmitting(false); }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-lilac/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-lilac/30 animate-ping" style={{ animationDelay: '0.3s' }} />
            <div className="absolute inset-4 w-12 h-12 border-4 border-lilac/30 border-t-lilac rounded-full animate-spin login-spinner-glow" />
          </div>
          <p className="text-lilac-glow font-medium text-sm animate-pulse">{t('login.connecting')}</p>
        </div>
      </div>
    );
  }

  const tabs: AuthMode[] = ['LOGIN', 'REGISTER'];
  const tabLabels: Record<AuthMode, string> = { LOGIN: t('auth.sign_in'), REGISTER: t('auth.register') };
  const tabIcons: Record<AuthMode, string> = { LOGIN: 'login', REGISTER: 'person_add' };

  return (
    <div className="min-h-screen flex">
      <HeroPanel />

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-lilac-50 via-white to-lilac-50/50 p-6 sm:p-8 lg:p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-lilac/5 blur-3xl pointer-events-none login-vine-float" style={{ '--duration': '15s', '--delay': '0s', '--start-rot': '0deg' } as React.CSSProperties} />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-lilac-dark/5 blur-3xl pointer-events-none login-vine-float" style={{ '--duration': '12s', '--delay': '3s', '--start-rot': '0deg' } as React.CSSProperties} />

        <div className="w-full max-w-md relative">
          <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-lilac/30 via-lilac-glow/20 to-lilac-dark/30 opacity-0 lg:opacity-100 blur-sm login-hero-gradient" />
          <div className="relative login-glass rounded-3xl p-8 sm:p-10 login-stagger-enter">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="relative inline-block">
                <div className="absolute -inset-3 rounded-2xl border border-lilac/20 animate-ping opacity-30" style={{ animationDuration: '3s' }} />
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-lilac to-lilac-dark shadow-xl shadow-lilac/25 mb-4 relative">
                  <span aria-hidden="true" className="material-symbols-outlined text-white text-3xl">agriculture</span>
                </div>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">HarvestPro<span className="text-lilac">NZ</span></h1>
              <p className="text-slate-400 text-sm font-medium mt-1">{t('login.platform')}</p>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-black text-slate-900 mb-1">{mode === 'LOGIN' ? t('auth.welcome') : t('auth.register_desc')}</h2>
              <p className="text-slate-400 text-sm">{mode === 'LOGIN' ? t('auth.sign_in_desc') : t('auth.register_hr_notice')}</p>
            </div>

            {/* Tab Pills */}
            <div className="flex p-1.5 bg-slate-100/80 rounded-2xl mb-8 border border-slate-200/50 relative">
              {tabs.map((m) => (
                <button key={m} onClick={() => switchTab(m)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 relative z-10 ${mode === m ? 'bg-white text-lilac-dark shadow-md shadow-lilac/10 border border-lilac/20' : 'text-slate-500 hover:text-lilac-dark hover:bg-white/40 border border-transparent'}`}>
                  <span aria-hidden="true" className={`material-symbols-outlined text-base transition-transform duration-300 ${mode === m ? 'scale-110' : ''}`}>{tabIcons[m]}</span>
                  {tabLabels[m]}
                </button>
              ))}
            </div>

            {success && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-slide-up">
                <div className="login-success-check">
                  <svg width="20" height="20" viewBox="0 0 20 20" className="text-emerald-500">
                    <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" className="login-check-circle" />
                    <path d="M6 10l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="login-check-mark" />
                  </svg>
                </div>
                <p className="text-sm text-emerald-700 font-medium">{success}</p>
              </div>
            )}

            {error && (
              <div key={`error-${shakeKey}`} className="mb-6 relative login-shake">
                <div className="absolute inset-0 rounded-2xl bg-red-400/20 animate-login-error-flash pointer-events-none" />
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex items-center gap-3 relative z-10 shadow-lg shadow-red-500/10 animate-login-error-glow">
                  <div className="relative">
                    <span aria-hidden="true" className="material-symbols-outlined text-red-500 text-lg animate-bounce">error</span>
                    <div className="absolute inset-0 rounded-full bg-red-400/20 animate-ping" />
                  </div>
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              </div>
            )}

            <div key={`form-${tabKey}`} className="animate-scale-in">
              {mode === 'LOGIN' && <LoginForm email={email} setEmail={setEmail} password={password} setPassword={setPassword} isSubmitting={isSubmitting} onSubmit={handleLogin} onForgotPassword={handleForgotPassword} />}
              {mode === 'REGISTER' && <RegisterForm fullName={fullName} setFullName={setFullName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} isSubmitting={isSubmitting} onSubmit={handleRegister} />}
            </div>

            <p className="text-center text-slate-300 text-xs mt-8">
              © {new Date().getFullYear()} HarvestPro NZ • <a href="#terms" className="hover:text-lilac transition-colors">{t('login.terms')}</a> • <a href="#privacy" className="hover:text-lilac transition-colors">{t('login.privacy')}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;