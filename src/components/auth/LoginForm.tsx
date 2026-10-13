import React, { useState, useRef } from 'react';
import { useTranslation } from '@/i18n';

interface LoginFormProps {
    email: string;
    setEmail: (v: string) => void;
    password: string;
    setPassword: (v: string) => void;
    isSubmitting: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onForgotPassword: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({
    email, setEmail, password, setPassword, isSubmitting, onSubmit, onForgotPassword,
}) => {
    const { t } = useTranslation();
    const [showPassword, setShowPassword] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    const handleBtnMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        btnRef.current.style.setProperty('--ripple-x', `${x}%`);
        btnRef.current.style.setProperty('--ripple-y', `${y}%`);
    };

    return (
        <form onSubmit={onSubmit} className="space-y-5">
            {/* Email field with animated underline */}
            <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block transition-colors duration-300 ${emailFocused ? 'text-lilac' : 'text-slate-500'}`}>
                    {t('auth.email')}
                </label>
                <div className="relative group">
                    <span aria-hidden="true" className={`material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg transition-all duration-300 ${emailFocused ? 'text-lilac scale-110' : 'text-lilac-glow/60'}`}>
                        mail
                    </span>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setEmailFocused(true)}
                        onBlur={() => setEmailFocused(false)}
                        placeholder="you@email.com"
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white border-2 border-slate-200 focus:border-lilac focus:ring-4 focus:ring-lilac/10 text-slate-800 placeholder-slate-300 outline-none transition-all duration-300 font-medium"
                        required
                    />
                    {/* Animated underline on focus */}
                    <div className={`absolute bottom-0 left-1/2 h-[2px] bg-gradient-to-r from-lilac to-lilac-light rounded-full transition-all duration-500 ${emailFocused ? 'w-[calc(100%-2rem)] -translate-x-1/2' : 'w-0 -translate-x-1/2'}`} />
                </div>
            </div>

            {/* Password field with animated underline */}
            <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block transition-colors duration-300 ${passwordFocused ? 'text-lilac' : 'text-slate-500'}`}>
                    {t('auth.password')}
                </label>
                <div className="relative group">
                    <span aria-hidden="true" className={`material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg transition-all duration-300 ${passwordFocused ? 'text-lilac scale-110' : 'text-lilac-glow/60'}`}>
                        lock
                    </span>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-white border-2 border-slate-200 focus:border-lilac focus:ring-4 focus:ring-lilac/10 text-slate-800 placeholder-slate-300 outline-none transition-all duration-300 font-medium"
                        required
                    />
                    <button aria-label={showPassword ? t('login.hide_password') : t('login.show_password')} aria-pressed={showPassword}
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-lilac hover:scale-110 transition-all duration-200"
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                    {/* Animated underline on focus */}
                    <div className={`absolute bottom-0 left-1/2 h-[2px] bg-gradient-to-r from-lilac to-lilac-light rounded-full transition-all duration-500 ${passwordFocused ? 'w-[calc(100%-2rem)] -translate-x-1/2' : 'w-0 -translate-x-1/2'}`} />
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-lilac font-semibold hover:text-lilac-dark hover:translate-x-0.5 transition-all duration-200"
                >
                    {t('auth.forgot_password')}
                </button>
            </div>

            {/* Submit Button — with magnetic hover glow */}
            <button
                ref={btnRef}
                type="submit"
                disabled={isSubmitting}
                onMouseMove={handleBtnMouseMove}
                className={`login-btn-ripple w-full py-4 bg-gradient-to-r from-lilac to-lilac-dark text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-lilac/25 transition-all duration-300 relative overflow-hidden ${isSubmitting
                        ? 'opacity-80 cursor-wait animate-pulse'
                        : 'hover:from-lilac-light hover:to-lilac hover:shadow-2xl hover:shadow-lilac/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]'
                    }`}
            >
                <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className={`material-symbols-outlined text-base transition-transform duration-300 ${isSubmitting ? 'animate-spin' : ''}`}>
                        {isSubmitting ? 'progress_activity' : 'login'}
                    </span>
                    {isSubmitting ? t('auth.signing_in') : t('auth.sign_in')}
                </span>
                {/* Sliding loading bar at bottom */}
                {isSubmitting && (
                    <div className="absolute bottom-0 left-0 h-[3px] w-full">
                        <div className="h-full bg-white/40 rounded-full animate-login-loading-bar" />
                    </div>
                )}
            </button>
        </form>
    );
};

export default LoginForm;
