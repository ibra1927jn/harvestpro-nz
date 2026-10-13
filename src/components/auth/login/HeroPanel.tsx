/**
 * HeroPanel — Left panel of the Login page with parallax vineyard hero
 */
import React from 'react';
import { useTypewriter, useCounter, useParallax } from '@/hooks/useLoginAnimations';
import { VineLeaf, GrapeCluster, ParticleDots } from './Decorations';
import { useTranslation } from '@/i18n';

const HeroPanel: React.FC = () => {
    const { ref: heroRef, offset } = useParallax();
    const { t } = useTranslation();
    const highlight = t('login.hero_highlight');
    const { displayed: typedTitle, done: titleDone } = useTypewriter(t('login.hero_title'), 50, 600);
    const roleCount = useCounter(8, 1500, 1400);
    const complianceCount = useCounter(100, 2000, 1600);

    return (
        <div ref={heroRef} className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
            {/* Vineyard photo with parallax */}
            <img
                src="/orchard-hero.png"
                alt={t('login.hero_alt')}
                // lazy: el panel está oculto en el móvil y así no se descarga (123 KB en 3G)
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out"
                style={{ transform: `scale(1.05) translate(${offset.x * -8}px, ${offset.y * -8}px)` }}
            />
            <div className="absolute inset-0 login-vineyard-overlay" />
            <div className="absolute inset-0 login-hero-gradient opacity-40 mix-blend-overlay" />

            <ParticleDots />

            {/* Floating decorations */}
            <VineLeaf className="absolute w-20 h-20 text-lilac-glow login-vine-float transition-transform duration-700" style={{ top: '15%', right: '12%', '--duration': '9s', '--delay': '0s', '--start-rot': '-15deg', transform: `translate(${offset.x * 15}px, ${offset.y * 15}px)` } as React.CSSProperties} />
            <VineLeaf className="absolute w-14 h-14 text-white login-vine-float transition-transform duration-700" style={{ bottom: '25%', left: '8%', '--duration': '11s', '--delay': '2s', '--start-rot': '10deg', transform: `translate(${offset.x * -10}px, ${offset.y * -10}px)` } as React.CSSProperties} />
            <GrapeCluster className="absolute w-16 h-20 text-lilac-light login-vine-float transition-transform duration-700" style={{ top: '55%', right: '6%', '--duration': '10s', '--delay': '1s', '--start-rot': '5deg', transform: `translate(${offset.x * 20}px, ${offset.y * 12}px)` } as React.CSSProperties} />
            <VineLeaf className="absolute w-10 h-10 text-lilac-glow/60 login-vine-float transition-transform duration-700" style={{ top: '75%', left: '20%', '--duration': '8s', '--delay': '3s', '--start-rot': '-8deg', transform: `translate(${offset.x * -12}px, ${offset.y * 18}px)` } as React.CSSProperties} />
            <GrapeCluster className="absolute w-12 h-16 text-white/40 login-vine-float transition-transform duration-700" style={{ top: '30%', left: '15%', '--duration': '12s', '--delay': '4s', '--start-rot': '12deg', transform: `translate(${offset.x * 8}px, ${offset.y * -14}px)` } as React.CSSProperties} />

            {/* Content */}
            <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                {/* Logo */}
                <div className="flex items-center gap-3 animate-fade-in">
                    <div className="relative">
                        <div className="absolute -inset-2 rounded-2xl border border-lilac-glow/20 animate-ping opacity-40" style={{ animationDuration: '3s' }} />
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-lilac-glow/30 relative z-10">
                            <span aria-hidden="true" className="material-symbols-outlined text-white text-2xl">agriculture</span>
                        </div>
                    </div>
                    <div>
                        <h2 className="text-white font-black text-xl tracking-tight">HarvestPro<span className="text-lilac-light">NZ</span></h2>
                        <p className="text-white/40 text-xs font-medium">{t('login.workforce')}</p>
                    </div>
                </div>

                {/* Hero text with typewriter */}
                <div className="max-w-md">
                    <h1 className="text-5xl font-black text-white leading-tight mb-6 min-h-[180px]">
                        {typedTitle.split(highlight).map((part, i) =>
                            i === 0 ? (
                                <React.Fragment key={i}>{part}</React.Fragment>
                            ) : (
                                <React.Fragment key={i}>
                                    <span className="bg-gradient-to-r from-lilac-light to-lilac-glow bg-clip-text text-transparent">{highlight}</span>
                                    {part}
                                </React.Fragment>
                            )
                        )}
                        {!titleDone && <span className="inline-block w-[3px] h-[1em] bg-lilac-light ml-1 animate-pulse align-middle" />}
                    </h1>
                    <p className="text-white/50 text-base leading-relaxed mb-8 animate-fade-in" style={{ animationDelay: '2.5s', animationFillMode: 'both' }}>
                        {t('login.hero_desc')}
                    </p>
                    <div className="flex gap-8">
                        <div className="animate-slide-up stagger-1">
                            <p className="text-3xl font-black text-white tabular-nums">{roleCount}</p>
                            <p className="text-lilac-glow/60 text-xs font-medium uppercase tracking-wider">{t('login.roles')}</p>
                        </div>
                        <div className="w-px bg-lilac/20" />
                        <div className="animate-slide-up stagger-2">
                            <p className="text-3xl font-black text-white">24/7</p>
                            <p className="text-lilac-glow/60 text-xs font-medium uppercase tracking-wider">{t('login.offline_first')}</p>
                        </div>
                        <div className="w-px bg-lilac/20" />
                        <div className="animate-slide-up stagger-3">
                            <p className="text-3xl font-black text-white tabular-nums">{complianceCount}%</p>
                            <p className="text-lilac-glow/60 text-xs font-medium uppercase tracking-wider">{t('login.nz_compliant')}</p>
                        </div>
                    </div>
                </div>

                {/* Trust badges */}
                <div className="flex items-center gap-6">
                    {[
                        { icon: 'shield', label: t('login.rls_secured'), color: 'text-lilac-light', delay: '0.1s' },
                        { icon: 'cloud_sync', label: t('login.realtime_sync'), color: 'text-lilac-glow', delay: '0.2s' },
                        { icon: 'verified', label: t('login.nz_compliant'), color: 'text-lilac-light', delay: '0.3s' },
                    ].map((badge) => (
                        <div key={badge.icon} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-lilac/20 backdrop-blur-sm hover:bg-white/10 hover:border-lilac/40 transition-all duration-300 animate-slide-up" style={{ animationDelay: badge.delay, animationFillMode: 'both' }}>
                            <span aria-hidden="true" className={`material-symbols-outlined ${badge.color} text-sm`}>{badge.icon}</span>
                            <span className="text-white/50 text-xs font-medium">{badge.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HeroPanel;
