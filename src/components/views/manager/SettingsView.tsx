/**
 * SettingsView — Orchard Settings (Manager)
 *
 * Refactored architecture:
 *   SettingsView.tsx           — Thin orchestrator, UI only
 *   useSettings.ts             — Data hook (state, handlers, save logic)
 *   settings/
 *     ├── SettingsFormComponents.tsx — Reusable: SettingsSection, FormField, ReadonlyField, ToggleRow
 *     ├── SettingsFields.tsx     — LockedField, ComplianceTargetField, OrchardSelector
 *     └── settingsLogic.ts       — Pure helpers (compliance floor clamp, warning text)
 *
 * Responsive layout:
 *   Mobile  (<768px) : single column
 *   Tablet  (≥768px) : 2-column grid
 *   Desktop (≥1024px): 3-column grid, max-width 1200px centered
 *   Profile card and Danger Zone always span full width.
 */
import React from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useTranslation, SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { DayClosureButton } from './DayClosureButton';
import PageHeader from '@/components/ui/PageHeader';
import { SettingsSection, FormField, ReadonlyField, ToggleRow } from './settings/SettingsFormComponents';
import { VarietyRatesEditor } from './settings/VarietyRatesEditor';
import { LockedField, ComplianceTargetField, OrchardSelector } from './settings/SettingsFields';
import { roleLabel } from '@/i18n/roleLabel';


const SettingsView: React.FC = () => {
    const s = useSettings();
    const { locale, setLocale, t } = useTranslation();

    return (
        <div className="p-4 md:p-6 max-w-[1200px] mx-auto pb-24 animate-fade-in">
            <PageHeader icon="settings" title={t('settings.header')} subtitle={t('settings.subtitle').replace('{orchard}', s.orchard?.name || 'Orchard')} />

            {/* ── Profile Card — full width on all breakpoints ── */}
            <section className="glass-card overflow-hidden section-enter stagger-1 mb-5">
                <div className="relative">
                    {/* Banner con avatar a la izquierda y quick-stats a la derecha */}
                    <div className="h-20 gradient-primary opacity-90 flex items-center px-6 justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center text-base font-black text-white shadow">
                                {s.initials}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white truncate leading-tight">{s.currentUser?.name || t('settings.banner.role')}</h3>
                                <p className="text-[10px] text-white/60 capitalize leading-tight">{t('settings.banner.orchard_line', { role: roleLabel(t, s.currentUser?.role || 'manager'), orchard: s.orchard?.name || t('settings.no_orchard') })}</p>
                            </div>
                        </div>
                        {/* Quick stats en el banner derecho */}
                        <div className="hidden sm:flex items-center gap-4">
                            {[
                                { value: s.orchard?.total_rows || '—', label: t('settings.banner.rows') },
                                { value: `$${s.formData.piece_rate}`, label: t('settings.banner.rate') },
                                { value: `${s.formData.target_tons}t`, label: t('settings.banner.target') },
                            ].map(stat => (
                                <div key={stat.label} className="text-center">
                                    <p className="text-base font-black text-white tabular-nums leading-tight">{stat.value}</p>
                                    <p className="text-[9px] text-white/50 font-bold uppercase tracking-wider">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Quick stats móvil (below banner) */}
                    <div className="sm:hidden grid grid-cols-3 gap-3 px-5 py-3">
                        {[
                            { value: s.orchard?.total_rows || '—', label: t('settings.banner.rows') },
                            { value: `$${s.formData.piece_rate}`, label: t('settings.banner.rate') },
                            { value: `${s.formData.target_tons}t`, label: t('settings.banner.target') },
                        ].map(stat => (
                            <div key={stat.label} className="text-center p-2 rounded-xl bg-slate-50">
                                <p className="text-lg font-bold text-text-main tabular-nums">{stat.value}</p>
                                <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Settings Grid — responsive: 1 col mobile / 2 col tablet / 3 col desktop ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

            {/* ── Harvest Configuration ────────────────── */}
            <SettingsSection icon="tune" iconBg="bg-indigo-50" iconColor="text-indigo-600" title={t('settings.harvest.title')} subtitle={t('settings.harvest.subtitle')} accentColor="border-l-indigo-500" stagger={2}>
                <FormField label={t('settings.harvest.piece_rate')} value={s.formData.piece_rate} onChange={(v) => s.handleChange('piece_rate', v)} prefix="$" type="number" step="0.50" />
                <VarietyRatesEditor orchardId={s.orchard?.id} defaultRate={Number(s.formData.piece_rate) || 0} />
                {s.canEditMinWage
                    ? <FormField label={t('settings.harvest.min_wage')} value={s.formData.min_wage_rate} onChange={(v) => s.handleChange('min_wage_rate', v)} prefix="$" suffix="NZD" type="number" step="0.05" />
                    : <LockedField label={t('settings.harvest.min_wage')} value={`$${s.formData.min_wage_rate} NZD`} tooltip={t('settings.locked_by_hr')} />
                }
                <ComplianceTargetField
                    value={s.formData.min_buckets_per_hour}
                    floor={s.complianceFloor}
                    minWage={s.formData.min_wage_rate}
                    pieceRate={s.formData.piece_rate}
                    onChange={(v) => s.handleChange('min_buckets_per_hour', v)}
                />
                <FormField label={t('settings.harvest.daily_target')} value={s.formData.target_tons} onChange={(v) => s.handleChange('target_tons', v)} type="number" step="1" />
                {/* Shift timing — ancla todos los cálculos de ETA/horas restantes */}
                <div className="border-t border-slate-100 pt-3 mt-1">
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mb-3">{t('settings.harvest.shift_hours')}</p>
                    <div className="flex items-center justify-between py-1">
                        <label className="text-sm font-medium text-text-sub flex items-center gap-1.5">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm text-indigo-400">schedule</span>
                            {t('settings.harvest.shift_start')}
                        </label>
                        <input
                            type="time"
                            value={s.formData.shift_start_time}
                            onChange={(e) => s.handleChange('shift_start_time', e.target.value)}
                            aria-label={t('settings.harvest.shift_start')}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                        />
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <label className="text-sm font-medium text-text-sub flex items-center gap-1.5">
                            <span aria-hidden="true" className="material-symbols-outlined text-sm text-indigo-400">schedule</span>
                            {t('settings.harvest.shift_end')}
                        </label>
                        <input
                            type="time"
                            value={s.formData.shift_end_time}
                            onChange={(e) => s.handleChange('shift_end_time', e.target.value)}
                            aria-label={t('settings.harvest.shift_end')}
                            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-text-main font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                        />
                    </div>
                </div>
            </SettingsSection>

            {/* ── Orchard Details ──────────────────────── */}
            <SettingsSection icon="park" iconBg="bg-emerald-50" iconColor="text-emerald-600" title={t('settings.orchard.title')} subtitle={t('settings.orchard.subtitle')} accentColor="border-l-emerald-500" stagger={3}>
                <OrchardSelector
                    orchards={s.availableOrchards}
                    selectedId={s.orchard?.id ?? ''}
                    onSelect={s.handleOrchardSelect}
                />
                <ReadonlyField label={t('settings.orchard.total_rows')} value={String(s.orchard?.total_rows ?? '—')} icon="grid_view" />
                <ReadonlyField label={t('settings.orchard.varieties')} value={s.orchardVarieties} icon="eco" />
            </SettingsSection>

            {/* ── Compliance ──────────────────────────── */}
            <SettingsSection icon="verified_user" iconBg="bg-green-50" iconColor="text-green-600" title={t('settings.compliance.title')} subtitle={t('settings.compliance.subtitle')} accentColor="border-l-green-500" stagger={4}>
                <ToggleRow label={t('settings.compliance.nz_standards')} description={t('settings.compliance.nz_standards_desc')} checked={s.compliance.nz_employment_standards} onChange={(v) => s.setCompliance(prev => ({ ...prev, nz_employment_standards: v }))} icon="gavel" />
                <ToggleRow label={t('settings.compliance.wage_alerts')} description={t('settings.compliance.wage_alerts_desc')} checked={s.compliance.auto_wage_alerts} onChange={(v) => s.setCompliance(prev => ({ ...prev, auto_wage_alerts: v }))} icon="notification_important" />
                <ToggleRow label={t('settings.compliance.safety')} description={t('settings.compliance.safety_desc')} checked={s.compliance.safety_verification} onChange={(v) => s.setCompliance(prev => ({ ...prev, safety_verification: v }))} icon="health_and_safety" />
                {/* Audit Trail — siempre activo, no es toggle interactivo */}
                <div className="flex items-center justify-between py-1">
                    <div className="flex items-start gap-2 flex-1">
                        <span aria-hidden="true" className="material-symbols-outlined text-sm text-slate-400 mt-0.5">history</span>
                        <div>
                            <p className="text-sm font-medium text-text-sub">{t('settings.compliance.audit_trail')}</p>
                            <p className="text-[11px] text-text-muted">{t('settings.compliance.audit_trail_desc')}</p>
                        </div>
                    </div>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-700 shrink-0">
                        <span aria-hidden="true" className="material-symbols-outlined text-xs">lock</span>
                        {t('settings.compliance.always_on')}
                    </span>
                </div>
            </SettingsSection>

            {/* ── Notifications ────────────────────────── */}
            <SettingsSection icon="notifications_active" iconBg="bg-amber-50" iconColor="text-amber-600" title={t('settings.notifications')} subtitle={t('settings.notif.subtitle')} accentColor="border-l-amber-500" stagger={5}>
                <ToggleRow label={t('settings.notif.enable')} description={t('settings.notif.enable_desc')} checked={s.notifEnabled} onChange={s.handleNotifToggle} icon="notifications" />
                {s.notifEnabled && (
                    <>
                        <div className="border-t border-slate-100 pt-3 mt-1">
                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mb-3">{t('settings.notif.types')}</p>
                            <div className="space-y-3">
                                <ToggleRow label={t('settings.notif.visa')} checked={s.notifTypes.visa_expiry} onChange={(v) => s.handleNotifType('visa_expiry', v)} icon="badge" compact />
                                <ToggleRow label={t('settings.notif.qc')} checked={s.notifTypes.qc_reject} onChange={(v) => s.handleNotifType('qc_reject', v)} icon="error" compact />
                                <ToggleRow label={t('settings.notif.transport')} checked={s.notifTypes.transport} onChange={(v) => s.handleNotifType('transport', v)} icon="local_shipping" compact />
                                <ToggleRow label={t('settings.notif.attendance')} checked={s.notifTypes.attendance} onChange={(v) => s.handleNotifType('attendance', v)} icon="assignment_late" compact />
                            </div>
                        </div>
                        <div className="pt-2">
                            <button
                                onClick={s.handleSendTest}
                                className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${s.notifTestSent ? 'text-green-700 bg-green-50 border border-green-200' : 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 active:scale-[0.97]'}`}
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-base">{s.notifTestSent ? 'check_circle' : 'send'}</span>
                                {s.notifTestSent ? `${t('settings.notif.test_sent')} ✓` : t('settings.notif.send_test')}
                            </button>
                        </div>
                    </>
                )}
            </SettingsSection>

            {/* ── Language ──────────────────────────────── */}
            <SettingsSection icon="translate" iconBg="bg-violet-50" iconColor="text-violet-600" title={t('settings.language')} subtitle={t('settings.language_desc')} accentColor="border-l-violet-500" stagger={6}>
                <div className="flex flex-wrap justify-center gap-2">
                    {SUPPORTED_LOCALES.map((loc) => (
                        <button
                            key={loc.code}
                            onClick={() => setLocale(loc.code as Locale)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all active:scale-[0.96] ${locale === loc.code ? 'border-violet-500 bg-violet-50 shadow-sm shadow-violet-100' : 'border-slate-100 hover:border-violet-200 hover:bg-slate-50'}`}
                        >
                            <span className="text-2xl">{loc.flag}</span>
                            <span className={`text-xs font-semibold ${locale === loc.code ? 'text-violet-700' : 'text-text-sub'}`}>{loc.nativeName}</span>
                            {locale === loc.code && (
                                <span className="text-[10px] text-violet-500 font-bold flex items-center gap-0.5">
                                    <span aria-hidden="true" className="material-symbols-outlined text-xs">check_circle</span>{t('settings.language.active')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </SettingsSection>

            </div>{/* end settings grid */}

            {/* ── Save Button — full width ──────────────── */}
            <div className="space-y-3 section-enter stagger-7 mt-5">
                <button
                    onClick={s.handleSave}
                    disabled={s.isSaving || !s.hasChanges}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${s.hasChanges ? 'gradient-primary glow-primary text-white hover:scale-[1.01]' : 'bg-slate-100 text-text-muted cursor-not-allowed'}`}
                >
                    <span aria-hidden="true" className={`material-symbols-outlined text-base ${s.isSaving ? 'animate-spin' : ''}`}>
                        {s.isSaving ? 'refresh' : 'save'}
                    </span>
                    {s.isSaving ? t('hr.saving') : s.hasChanges ? t('settings.save_changes') : t('settings.saved_banner')}
                </button>
                {s.saveStatus === 'saved' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600 animate-slide-up">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">check_circle</span>{t('settings.saved_ok')}
                    </div>
                )}
                {s.saveStatus === 'error' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-red-600 animate-slide-up">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">error</span>{s.saveError || t('settings.save_failed')}
                    </div>
                )}
            </div>

            {/* ── Danger Zone ──────────────────────────── */}
            <section className="glass-card overflow-hidden border-l-4 border-l-red-400 section-enter stagger-8">
                <div className="px-5 py-4 border-b border-slate-100 bg-red-50/50">
                    <div className="flex items-center gap-3">
                        <div className="bg-red-100 p-2 rounded-xl">
                            <span aria-hidden="true" className="material-symbols-outlined text-base text-red-600">warning</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-text-main">{t('settings.danger.title')}</h3>
                            <p className="text-[11px] text-red-600/70 font-medium">{t('settings.danger.subtitle')}</p>
                        </div>
                    </div>
                </div>
                <div className="px-5 py-4 space-y-4">
                    <div>
                        <div className="flex items-start gap-3 mb-3">
                            <span aria-hidden="true" className="material-symbols-outlined text-base text-text-muted mt-0.5">lock_clock</span>
                            <div>
                                <p className="text-sm font-semibold text-text-main">{t('settings.danger.day_closure')}</p>
                                <p className="text-xs text-text-muted">{t('settings.danger.day_closure_desc')}</p>
                            </div>
                        </div>
                        <DayClosureButton />
                    </div>
                    <div className="border-t border-red-100 pt-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <span aria-hidden="true" className="material-symbols-outlined text-base text-text-muted mt-0.5">delete_sweep</span>
                                <div>
                                    <p className="text-sm font-semibold text-text-main">{t('settings.danger.reset_title')}</p>
                                    <p className="text-xs text-text-muted">{t('settings.danger.reset_desc')}</p>
                                </div>
                            </div>
                            <button className="px-3.5 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all active:scale-[0.96]">
                                {t('settings.danger.reset_btn')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Footer ──────────────────────────────── */}
            <div className="text-center py-4 space-y-1 section-enter stagger-8">
                <p className="text-xs font-bold text-text-muted">
                    HarvestPro NZ<span className="text-text-muted/50 mx-1.5">•</span>v9.9.0
                </p>
                <p className="text-[11px] text-text-muted/60">{t('settings.copyright')}</p>
            </div>
        </div>
    );
};

export default SettingsView;
