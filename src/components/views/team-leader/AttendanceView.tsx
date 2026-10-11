import { logger } from '@/utils/logger';
import { useAuth } from '../../../context/AuthContext';
import { useAttendance } from '../../../hooks/useAttendance';
import { useToast } from '@/hooks/useToast';
import Toast from '@/components/ui/Toast';

interface Picker {
    id: string;
    name: string;
    avatar?: string;
}

const AttendanceView = () => {
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

    // Handlers
    const handleCheckIn = async (picker: Picker) => {
        try {
            await checkIn(picker.id);
        } catch (error: unknown) {
            showToast((error as Error).message || 'Failed to check in', 'error');
        }
    };

    const handleCheckOut = async (attendanceId: string) => {
        try {
            await checkOut(attendanceId);
        } catch (err) {

            logger.error(err);
        }
    };

    return (
        <div className="bg-slate-50 min-h-screen pb-24">
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
            {/* Header */}
            <header className="bg-white px-6 py-6 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Daily Roll Call</h1>
                        <p className="text-slate-500 text-sm font-medium">
                            {new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                    {loading && <span className="material-symbols-outlined animate-spin text-primary">sync</span>}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 p-3 rounded-2xl border border-green-100 flex flex-col items-center">
                        <span className="text-2xl font-black text-green-600">{stats.present}</span>
                        <span className="text-xs font-bold text-green-700 uppercase">Present</span>
                    </div>
                    <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex flex-col items-center">
                        <span className="text-2xl font-black text-slate-500">{stats.absent}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase">Absent</span>
                    </div>
                </div>
            </header>

            {/* List */}
            <main className="px-4 mt-6 space-y-3">
                {mergedList.map(item => (
                    <div
                        key={item.id}
                        className={`p-4 rounded-xl border flex items-center justify-between transition-all ${item.isPresent
                            ? 'bg-white border-green-200 shadow-sm'
                            : 'bg-slate-100 border-transparent opacity-80'
                            }`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`size-12 rounded-full flex items-center justify-center text-sm font-bold border ${item.isPresent ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'
                                }`}>
                                {item.avatar || (item.name ? item.name.substring(0, 2).toUpperCase() : '??')}
                            </div>
                            <div>
                                <h3 className={`font-bold text-base ${item.isPresent ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {item.name}
                                </h3>
                                <p className="text-xs font-semibold text-slate-400">
                                    {item.attendanceRecord?.check_in
                                        ? `In: ${new Date(item.attendanceRecord.check_in).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })}`
                                        : 'Not checked in'
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Action Button */}
                        <div>
                            {processing === item.id || (item.attendanceRecord?.id && processing === item.attendanceRecord.id) ? (
                                <span className="material-symbols-outlined animate-spin text-slate-400">progress_activity</span>
                            ) : item.isPresent ? (
                                <button
                                    onClick={() => item.attendanceRecord?.id && handleCheckOut(item.attendanceRecord.id)}
                                    className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-100 hover:bg-red-100 transition-colors"
                                >
                                    Check Out
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleCheckIn(item)}
                                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-lg">login</span>
                                    Check In
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {mergedList.length === 0 && !loading && (
                    <div className="text-center py-12 text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2">group_off</span>
                        <p>No crew found in your roster.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AttendanceView;