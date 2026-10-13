// components/views/runner/LogisticsView.tsx
import React from 'react';
import { bucketsInBin } from '@/services/bin.service';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { avatarUrl } from '@/utils/avatarUrl';
import type { RejectedScan } from '@/hooks/useRunnerData';

interface LogisticsViewProps {
  onScan: (type?: 'BIN' | 'BUCKET') => void;
  pendingUploads?: number;
  /** Escaneos que el servidor no aceptó: no cuentan para la paga hasta que alguien lo resuelva */
  rejectedScans?: RejectedScan[];
  inventory?: {
    empty_bins?: number;
    raw?: { status: string; sunExposureStart?: number }[];
    [key: string]: unknown;
  };
  onBroadcast?: (message: string) => void;
  /** Pide bins vacíos a Logística (crea la petición de transporte) */
  onRequestRefill?: () => void;
  selectedBinId?: string;
}

const LogisticsView: React.FC<LogisticsViewProps> = ({
  onScan,
  pendingUploads = 0,
  rejectedScans = [],
  inventory,
  onBroadcast,
  onRequestRefill,
  selectedBinId,
}) => {
  const buckets = useHarvestStore(state => state.buckets);
  const bucketRecords = useHarvestStore(state => state.bucketRecords);
  // Cubetas en el bin activo (móvil + servidor, sin duplicar)
  const activeBinBuckets = bucketsInBin(selectedBinId, buckets || [], bucketRecords || []);
  // Código de la pegatina (no el id interno)
  const storeBins = useHarvestStore(state => state.inventory);
  const activeBinCode =
    (storeBins || []).find(b => b.id === selectedBinId)?.bin_code || selectedBinId?.slice(0, 8);

  const binCapacity = 72;
  const activeBinPercentage = Math.round((activeBinBuckets / binCapacity) * 100);

  const emptyBins = inventory?.empty_bins || 0;

  // Calculate Max Sun Exposure from raw bins (if passed)
  const [maxExposure, setMaxExposure] = React.useState('00:00:00');
  const [showRejected, setShowRejected] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      const rawBins = inventory?.raw || [];
      const fullRawBins = rawBins.filter(
        (b: { status: string; sunExposureStart?: number }) =>
          b.status === 'full' && b.sunExposureStart
      );

      if (fullRawBins.length === 0) {
        setMaxExposure('00:00:00');
        return;
      }

      const now = Date.now();
      const maxDiff = Math.max(...fullRawBins.map(b => now - b.sunExposureStart!));

      const hours = Math.floor(maxDiff / 3600000);
      const minutes = Math.floor((maxDiff % 3600000) / 60000);
      const seconds = Math.floor((maxDiff % 60000) / 1000);

      setMaxExposure(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [inventory]);

  // El aviso de éxito o error lo da quien crea la petición (useRunnerData)
  const handleRefillRequest = () => {
    if (onRequestRefill) onRequestRefill();
    else onBroadcast?.('Runner needs empty bins');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      {/* OmniCore Ambient Background */}
      <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[40%] rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none"></div>

      {/* Header */}
      <header className="flex-none bg-white/70 backdrop-blur-xl z-30 border-b border-white/50 shadow-[0_4px_30px_-5px_rgba(0,0,0,0.05)] pt-6">
        <div className="flex items-center px-6 py-4 justify-between">
          <div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent tracking-tight">Logistics Hub</h1>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">Runner Operations</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onBroadcast?.('Notification center requested')}
              className="relative flex items-center justify-center rounded-2xl size-11 bg-white/80 border border-white/60 shadow-sm text-slate-500 hover:text-primary transition-colors hover:shadow-md"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              <span className="absolute top-3 right-3 size-2 bg-primary rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)]"></span>
            </button>
            <div className="size-11 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden border border-white/60 shadow-sm">
              <img
                src={avatarUrl('Runner')}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
        
        {/* Offline Banner */}
        {pendingUploads > 0 && (
          <div className="bg-orange-50/90 backdrop-blur-md border-y border-orange-200/50 px-6 py-3 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-600 text-[14px]">cloud_off</span>
              </div>
              <p className="text-orange-800 text-sm font-bold tracking-tight">Offline Sync Pending</p>
            </div>
            <div
              data-testid="sync-badge"
              className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full shadow-sm border border-orange-100"
            >
              <span className="material-symbols-outlined text-orange-500 text-sm animate-spin-slow">sync</span>
              <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest">
                {pendingUploads} Pending
              </span>
            </div>
          </div>
        )}

        {/* Escaneos rechazados por el servidor: antes desaparecían sin aviso */}
        {rejectedScans.length > 0 && (
          <div data-testid="rejected-scans" className="bg-red-50/90 border-y border-red-200/60 px-6 py-3" role="alert">
            <button
              type="button"
              onClick={() => setShowRejected(v => !v)}
              aria-expanded={showRejected}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600 text-[18px]" aria-hidden="true">error</span>
                <span className="text-red-800 text-sm font-bold tracking-tight">
                  {rejectedScans.length} {rejectedScans.length === 1 ? 'scan' : 'scans'} not accepted — tell your manager
                </span>
              </span>
              <span className="material-symbols-outlined text-red-500 text-[18px]" aria-hidden="true">
                {showRejected ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {showRejected && (
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {rejectedScans.map(r => (
                  <li key={r.id} className="text-xs text-red-800">
                    <span className="font-bold">{r.picker_id}</span> · {r.timestamp.slice(0, 16).replace('T', ' ')} · {r.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-28 space-y-5 z-10 no-scrollbar">
        {/* Active Bin Card */}
        <div className="group relative bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-70"></div>
          
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-none mb-1">
                {selectedBinId ? `Bin ${activeBinCode}` : 'No Bin Selected'}
              </h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                {selectedBinId ? 'Fill Progress' : 'Scan a bin to start'}
              </p>
            </div>
            <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100/50 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active
            </div>
          </div>
          
          {/* SVG Chart */}
          <div className="flex items-center justify-center py-6 relative">
             <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full"></div>
            <div className="w-52 h-52 relative z-10">
              <svg className="block mx-auto max-w-full h-auto drop-shadow-sm" viewBox="0 0 36 36">
                <path
                  className="fill-none stroke-slate-100 stroke-[2.5]"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                ></path>
                <path
                  className="fill-none stroke-primary stroke-[2.5] stroke-linecap-round"
                  strokeDasharray={`${activeBinPercentage}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  style={{ filter: 'drop-shadow(0px 4px 6px rgba(37, 99, 235, 0.3))' }}
                ></path>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center mt-1">
                <span className="text-5xl font-black text-slate-800 tracking-tighter">{activeBinPercentage}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Filled
                </span>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50 text-center">
            <p className="text-primary text-2xl font-black tracking-tight">
              {activeBinBuckets}
              <span className="text-slate-300 font-bold mx-1.5 text-lg">/</span>
              <span className="text-slate-500">{binCapacity}</span>
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Buckets in current bin
            </p>
          </div>
        </div>

        {/* Sun Exposure */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-orange-500 border border-orange-200/50 shadow-inner">
              <span className="material-symbols-outlined text-[28px] material-icon-filled">wb_sunny</span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Sun Exposure
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                <p className="text-sm font-black text-emerald-600 uppercase tracking-wide">
                  Safe Level
                </p>
              </div>
            </div>
          </div>
          <div className="text-right bg-slate-50/80 px-4 py-2 rounded-2xl border border-slate-100">
            <p className="text-2xl font-mono font-black text-slate-700 tabular-nums tracking-tight">
              {maxExposure}
            </p>
          </div>
        </div>

        {/* Supply Management */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-5">
            Supply Management
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-b from-slate-50/80 to-slate-100/50 rounded-2xl p-4 border border-slate-100 hover:shadow-md transition-shadow">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Empty Bins</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-black text-slate-800 tracking-tight leading-none">{emptyBins}</span>
                <span
                  className={`text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-widest ${emptyBins < 5 ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}
                >
                  {emptyBins < 5 ? 'Low' : 'Good'}
                </span>
              </div>
            </div>
            <div className="bg-gradient-to-b from-slate-50/80 to-slate-100/50 rounded-2xl p-4 border border-slate-100 hover:shadow-md transition-shadow">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Empty Buckets</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                  {Math.max(10, emptyBins * 5)}
                </span>
                <span className="text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                    Stock OK
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleRefillRequest}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-[0_8px_16px_rgba(15,23,42,0.15)]"
          >
            <span className="material-symbols-outlined text-[18px]">local_shipping</span>
            Request Refill
          </button>
        </div>
      </div>

      {/* Floating Action Buttons (Fixed above nav) */}
      <div className="absolute bottom-5 left-0 w-full px-6 z-30">
        <div className="flex gap-4">
          <button
            onClick={() => onScan('BIN')}
            className="flex-1 flex flex-col items-center justify-center py-4 bg-white/90 backdrop-blur-md border-2 border-primary/20 text-primary rounded-[1.25rem] font-black text-xs uppercase tracking-widest active:scale-95 shadow-[0_8px_30px_rgba(37,99,235,0.1)] hover:border-primary/50 transition-all"
          >
            <span className="material-symbols-outlined mb-1.5 text-[28px]">crop_free</span>
            Scan Bin
          </button>
          <button
            onClick={() => onScan('BUCKET')}
            className="flex-1 flex flex-col items-center justify-center py-4 bg-gradient-to-r from-primary to-blue-500 text-white rounded-[1.25rem] font-black text-xs uppercase tracking-widest shadow-[0_8px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_12px_25px_rgba(37,99,235,0.4)] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined mb-1.5 text-[28px]">label</span>
            Scan Sticker
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogisticsView;
