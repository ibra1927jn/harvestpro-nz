/**
 * Detalle de la semana de una persona: cada día, en qué huerto, de qué hora a
 * qué hora, descanso, horas pagables, cubetas por variedad y lo que cobra.
 * Sale del mismo cálculo que la nómina (calculate-payroll → days).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PickerBreakdown } from '@/services/payroll.service';
import { loadOrchardNames } from '@/repositories/pay-rates.repository';

const nzTime = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—';
// La fecha ya es el día NZ: se formatea tal cual (en UTC), sin moverla de zona
const nzDay = (ymd: string) =>
    new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T12:00:00Z`));
const money = (n: number) => `$${n.toFixed(2)}`;

export const PayWeekDetail: React.FC<{ picker: PickerBreakdown; onClose: () => void }> = ({ picker, onClose }) => {
    const [orchards, setOrchards] = useState<Record<string, string>>({});
    useEffect(() => {
        loadOrchardNames().then(setOrchards).catch(() => setOrchards({}));
    }, []);
    const days = picker.days ?? [];

    // Portal al body: dentro del layout un contenedor con transform descolocaba el fixed
    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={`Week detail ${picker.picker_name}`} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-lg font-extrabold text-slate-800">{picker.picker_name}</h3>
                        <p className="text-xs font-bold text-slate-500">
                            {picker.buckets} buckets · {picker.hours_worked.toFixed(2)} h · {money(picker.piece_rate_earnings)} piece + {money(picker.top_up_required)} top-up = <span className="text-slate-800">{money(picker.total_earnings)}</span>
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-slate-100">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {days.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No day detail available.</p>
                ) : (
                    <div className="space-y-3">
                        {days.map(d => (
                            <div key={d.date} data-testid={`pay-day-${d.date}`} className="rounded-2xl border border-slate-100 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="font-extrabold text-slate-800 text-sm">
                                        {nzDay(d.date)}
                                        {d.isPublicHoliday && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-600">Public holiday</span>}
                                        {d.estimated && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Estimated · review</span>}
                                    </p>
                                    <p className="text-sm font-black text-slate-800">{money(d.total)}</p>
                                </div>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                                            <th className="text-left font-bold py-1">Orchard</th>
                                            <th className="text-left font-bold py-1">In</th>
                                            <th className="text-left font-bold py-1">Out</th>
                                            <th className="text-right font-bold py-1">Worked h</th>
                                            <th className="text-right font-bold py-1">Travel h</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.segments.length === 0 ? (
                                            <tr><td colSpan={5} className="py-1 text-slate-500">No check-in · hours estimated from scans</td></tr>
                                        ) : d.segments.map((s, i) => (
                                            <tr key={i} className="text-slate-700">
                                                <td className="py-1 font-semibold">{s.orchardId ? (orchards[s.orchardId] ?? s.orchardId.slice(0, 8)) : '—'}</td>
                                                <td className="py-1">{nzTime(s.checkIn)}</td>
                                                <td className="py-1">{nzTime(s.checkOut)}{s.open && <span className="ml-1 text-amber-600 font-bold">(open)</span>}</td>
                                                <td className="py-1 text-right">{s.grossHours.toFixed(2)}</td>
                                                <td className="py-1 text-right">{(s.travelHours ?? 0) > 0 ? (s.travelHours ?? 0).toFixed(2) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                                    <span>Break (unpaid): <b>{d.breakMinutes} min</b></span>
                                    {(d.travelMinutes ?? 0) > 0 && <span>Travel (paid, half to each orchard): <b>{d.travelMinutes} min</b></span>}
                                    <span>Paid hours: <b>{d.hours.toFixed(2)}</b></span>
                                    <span>Buckets: <b>{Object.entries(d.bucketsByVariety).map(([v, n]) => `${n} ${v === '—' ? '(no variety)' : v}`).join(' · ') || '0'}</b></span>
                                    <span>Piece: <b>{money(d.pieceEarnings)}</b></span>
                                    <span className={d.topUp > 0 ? 'text-amber-600' : ''}>Top-up: <b>{money(d.topUp)}</b></span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};

export default PayWeekDetail;
