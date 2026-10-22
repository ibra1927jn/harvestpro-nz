import { announce } from '@/services/announcer';
import { logger } from '@/utils/logger';
import { useAuth } from '../../../context/AuthContext';
import { useAttendance } from '../../../hooks/useAttendance';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useToast } from '@/hooks/useToast';
import Toast from '@/components/ui/Toast';
import { useTranslation } from '@/i18n';
import { formatNZDate, formatNZTime } from '@/utils/nzFormat';

interface Picker {
    id: string;
    name: string;
    avatar?: string;
}

const AttendanceView = () => {
    const { t } = useTranslation();
    const { appUser } = useAuth();
    const {
        loading,
        processing,
        mergedList,
        stats,
        checkIn,
        checkOut
    } = useAttendance(appUser ?? undefined);
    const { toast, showToast, hideToast } = useToast();
    // Tocar el nombre abre el cajón de perfil (el mismo que el manager); el fichaje va en su botón
    const openPickerProfile = useHarvestStore(s => s.openPickerProfile);

    const noSignal = (key: 'tl.attendance.no_signal_check_in' | 'tl.attendance.no_signal_check_out') =>
        typeof navigator !== 'undefined' && navigator.onLine === false ? t(key) : null;

    // Handlers
    const handleCheckIn = async (picker: Picker) => {
        try {
            await checkIn(picker.id);
            announce(t('tl.attendance.sr_checked_in', { name: picker.name }));
        } catch (error: unknown) {
            showToast(noSignal('tl.attendance.no_signal_check_in') || (error as Error).message || t('tl.attendance.check_in_failed'), 'error');
        }
    };

    const handleCheckOut = async (attendanceId: string, name?: string) => {
        try {
            await checkOut(attendanceId);
            announce(t('tl.attendance.sr_checked_out', { name: name ?? t('panel.role.picker') }));
        } catch (err) {
            // Antes solo iba al log: sin red el botón no hacía nada y nadie se enteraba
            logger.error(err);
            showToast(noSignal('tl.attendance.no_signal_check_out') || (err as Error)?.message || t('tl.attendance.check_out_failed'), 'error');
        }
    };

    return (
        <div className="bg-slate-50 min-h-screen pb-24">
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
            {/* Header */}
            <div className="bg-white px-6 py-6 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t('tl.attendance.title')}</h1>
                        <p className="text-slate-500 text-sm font-medium">
                            {formatNZDate(new Date(), 'weekday')}
                        </p>
                    </div>
                    {loading && <span aria-hidden="true" className="material-symbols-outlined animate-spin text-primary">sync</span>}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 p-3 rounded-2xl border border-green-100 flex flex-col items-center">
                        <span className="text-2xl font-black text-green-600">{stats.present}</span>
                        <span className="text-xs font-bold text-green-700 uppercase">{t('tl.attendance.present')}</span>
                    </div>
                    <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex flex-col items-center">
                        <span className="text-2xl font-black text-slate-500">{stats.absent}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase">{t('tl.attendance.absent')}</span>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="px-4 mt-6 space-y-3">
                {mergedList.map(item => (
                    <div
                        key={item.id}
                        className={`p-4 rounded-xl border flex flex-wrap gap-3 items-center justify-between transition-all ${item.isPresent
                            ? 'bg-white border-green-200 shadow-sm'
                            : 'bg-slate-100 border-transparent opacity-80'
                            }`}
                    >
                        <button
                            type="button"
                            onClick={() => openPickerProfile(item.id)}
                            aria-label={t('tl.picker.open_profile', { name: item.name })}
                            className="flex items-center gap-4 min-w-0 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                            <div className={`size-12 shrink-0 rounded-full flex items-center justify-center text-sm font-bold border ${item.isPresent ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'
                                }`}>
                                {item.avatar || (item.name ? item.name.substring(0, 2).toUpperCase() : '??')}
                            </div>
                            <span className="block">
                                <span className={`block font-bold text-base ${item.isPresent ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {item.name}
                                </span>
                                <span className="block text-xs font-semibold text-slate-400">
                                    {item.attendanceRecord?.check_in
                                        ? t('tl.attendance.in_at', { time: formatNZTime(item.attendanceRecord.check_in) })
                                        : t('tl.attendance.not_checked_in')
                                    }
                                </span>
                                {item.breakMissing && (
                                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-amber-700" title={t('tl.attendance.break_missing_hint')}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-sm">warning</span>
                                        {t('tl.attendance.break_missing')}
                                        <span className="sr-only">. {t('tl.attendance.break_missing_hint')}</span>
                                    </span>
                                )}
                            </span>
                        </button>

                        {/* Action Button */}
                        <div>
                            {processing === item.id || (item.attendanceRecord?.id && processing === item.attendanceRecord.id) ? (
                                <span aria-hidden="true" className="material-symbols-outlined animate-spin text-slate-400">progress_activity</span>
                            ) : item.isPresent ? (
                                <button
                                    aria-label={t('tl.attendance.check_out_name', { name: item.name })}
                                    onClick={() => item.attendanceRecord?.id && handleCheckOut(item.attendanceRecord.id, item.name)}
                                    className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-100 hover:bg-red-100 transition-colors"
                                >
                                    {t('tl.attendance.check_out')}
                                </button>
                            ) : (
                                <button
                                    aria-label={t('tl.attendance.check_in_name', { name: item.name })}
                                    onClick={() => handleCheckIn(item)}
                                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all flex items-center gap-1"
                                >
                                    <span aria-hidden="true" className="material-symbols-outlined text-lg">login</span>
                                    {t('tl.attendance.check_in')}
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {mergedList.length === 0 && !loading && (
                    <div className="text-center py-12 text-slate-400">
                        <span aria-hidden="true" className="material-symbols-outlined text-4xl mb-2">group_off</span>
                        <p>{t('tl.attendance.empty')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceView;