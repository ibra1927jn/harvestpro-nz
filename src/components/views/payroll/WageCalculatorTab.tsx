/**
 * Calculadora rápida: piece rate frente a salario mínimo.
 * (Movido sin cambios de marcado desde PayrollTabs.tsx.)
 */
import React, { useState } from 'react';
import { quickWage } from './payrollTabsLogic';

/* ── Wage Calculator Tab ── */
export const WageCalculatorTab: React.FC<{ settings: { bucket_rate: number; min_wage_rate: number } }> = ({ settings }) => {
    const [buckets, setBuckets] = useState(0);
    const [hours, setHours] = useState(8);

    const { pieceRate, minimumRequired, topUp, total } = quickWage(buckets, hours, settings);

    return (
        <div className="max-w-lg space-y-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-50"></div>
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-5">Quick Wage Calculator</h3>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="wage-calc-buckets" className="block text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Buckets Picked</label>
                        <input id="wage-calc-buckets" type="number" value={buckets} onChange={e => setBuckets(Number(e.target.value))} className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/60 bg-white/50 text-slate-800 font-black focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 outline-none transition-all" />
                    </div>
                    <div>
                        <label htmlFor="wage-calc-hours" className="block text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Hours Worked</label>
                        <input id="wage-calc-hours" type="number" step="0.5" value={hours} onChange={e => setHours(Number(e.target.value))} className="w-full px-5 py-3.5 rounded-2xl border border-slate-200/60 bg-white/50 text-slate-800 font-black focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 outline-none transition-all" />
                    </div>
                </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden">
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight mb-4">Result</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Piece Rate <span className="font-medium normal-case tracking-normal">({buckets} × ${settings.bucket_rate})</span></span>
                        <span className="text-sm font-black text-slate-800">${pieceRate.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Minimum Req. <span className="font-medium normal-case tracking-normal">({hours}h × ${settings.min_wage_rate})</span></span>
                        <span className="text-sm font-black text-slate-800">${minimumRequired.toFixed(2)}</span>
                    </div>
                    {topUp > 0 && (
                        <div className="flex justify-between py-1.5 text-amber-500 bg-amber-50/50 -mx-3 px-3 rounded-lg">
                            <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">shield</span>Wage Shield Top-Up
                            </span>
                            <span className="text-sm font-bold">+${topUp.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="border-t border-slate-200/60 pt-4 mt-2 flex justify-between items-center">
                        <span className="text-[13px] font-bold text-slate-800 uppercase tracking-widest">Total Earnings</span>
                        <span className="text-3xl font-black text-orange-500">${total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
