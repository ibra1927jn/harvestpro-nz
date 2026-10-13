import React from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { avatarUrl } from '@/utils/avatarUrl';

interface WarehouseViewProps {
    inventory?: {
        full_bins: number;
        empty_bins: number;
        in_progress: number;
        total: number;
    };
    onTransportRequest?: () => void;
}

const WarehouseView: React.FC<WarehouseViewProps> = ({ inventory, onTransportRequest }) => {
    const fullBins = inventory?.full_bins || 0;
    const emptyBins = inventory?.empty_bins || 0;
    const inProgress = inventory?.in_progress || 0;

    // Estado vacio: sin inventario
    if (!inventory || (fullBins === 0 && emptyBins === 0 && inProgress === 0)) {
        return (
            <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
                {/* OmniCore Ambient Background */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

                <header className="flex-none bg-white/70 backdrop-blur-xl z-30 border-b border-white/50 shadow-[0_4px_30px_-5px_rgba(0,0,0,0.05)] pt-6">
                    <div className="flex items-center px-6 py-4 justify-between">
                        <div>
                            <h2 className="text-2xl font-black bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent tracking-tight leading-tight">Warehouse Inventory</h2>
                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">Stock Management</p>
                        </div>
                    </div>
                </header>
                <div className="flex-1 flex items-center justify-center relative z-10 px-6">
                    <EmptyState
                        icon="warehouse"
                        title="No Warehouse Inventory"
                        subtitle="Bins will appear here once the harvest operation begins and bins start being filled."
                        iconColor="text-primary"
                        action={onTransportRequest ? {
                            label: 'Request transport',
                            onClick: onTransportRequest,
                            icon: 'local_shipping',
                        } : undefined}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            {/* OmniCore Ambient Background */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-[10%] right-[-10%] w-[50%] h-[40%] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none"></div>

            <header className="flex-none bg-white/70 backdrop-blur-xl z-30 border-b border-white/50 shadow-[0_4px_30px_-5px_rgba(0,0,0,0.05)] pt-6">
                <div className="flex items-center px-6 py-4 justify-between">
                    <div>
                        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent tracking-tight leading-tight">Warehouse Inventory</h2>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">Stock Management</p>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        <button aria-label="Notifications" className="relative flex items-center justify-center rounded-2xl size-11 bg-white/80 border border-white/60 shadow-sm text-slate-500 hover:text-primary transition-colors hover:shadow-md">
                            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">notifications</span>
                        </button>
                        <div className="size-11 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden border border-white/60 shadow-sm">
                            <img src={avatarUrl('Warehouse')} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 pb-28 z-10 no-scrollbar">
                {/* Hero Card */}
                <div className="group relative bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 overflow-hidden hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
                    <div className="absolute top-0 left-0 w-2.5 h-full bg-gradient-to-b from-primary to-blue-500 group-hover:w-3.5 transition-all"></div>
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-70"></div>
                    
                    <div className="flex items-start justify-between pl-3">
                        <div>
                            <h3 className="text-[11px] font-bold text-primary uppercase tracking-widest mb-1.5">Harvested Stock</h3>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Full Cherry Bins</h2>
                        </div>
                        <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/5 to-blue-500/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">inventory_2</span>
                        </div>
                    </div>
                    <div className="mt-8 flex items-baseline gap-2.5 pl-3">
                        <span className="text-7xl font-black text-slate-800 tracking-tighter leading-none">{fullBins}</span>
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">filled</span>
                    </div>
                    <div className="mt-6 pt-5 border-t border-slate-100/50 flex items-center justify-between pl-3">
                        <div className="flex items-center gap-2">
                            <span aria-hidden="true" className={`material-symbols-outlined text-xl ${fullBins > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>check_circle</span>
                            <span className={`text-xs font-bold uppercase tracking-wider ${fullBins > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{fullBins > 0 ? 'Ready for Pickup' : 'Awaiting Harvest'}</span>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
                        <div className="flex items-start justify-between mb-5">
                            <div className="size-12 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center text-orange-500 border border-orange-200/50 shadow-inner">
                                <span aria-hidden="true" className="material-symbols-outlined text-[24px]">grid_view</span>
                            </div>
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${emptyBins < 5 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                {emptyBins < 5 ? 'Critical' : 'Stock OK'}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col justify-end">
                            <span className="text-4xl font-black text-slate-800 block leading-tight tracking-tight mb-1">{emptyBins}</span>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Empty Bins</span>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
                        <div className="flex items-start justify-between mb-5">
                            <div className="size-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-blue-500 border border-blue-200/50 shadow-inner">
                                <span aria-hidden="true" className="material-symbols-outlined text-[24px]">shopping_basket</span>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-50 text-blue-600 uppercase tracking-widest border border-blue-100">IN-FLOW</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-end">
                            <span className="text-4xl font-black text-slate-800 block leading-tight tracking-tight mb-1">{inProgress}</span>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block leading-tight">In Progress</span>
                        </div>
                    </div>
                </div>

                {/* Truck Info */}
                <div className="bg-gradient-to-br from-slate-50/80 to-slate-100/50 rounded-[1.5rem] p-5 flex gap-4 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="size-12 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 shrink-0">
                        <span aria-hidden="true" className="material-symbols-outlined text-[24px]">local_shipping</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1.5">Transport</p>
                        <p className="text-xs font-medium text-slate-500 leading-relaxed">
                            {fullBins > 10 ? 'Dispatch requested for full bins.' : 'Use the button below to request a pickup.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div className="absolute bottom-5 left-0 w-full px-6 z-30">
                <button
                    onClick={onTransportRequest}
                    disabled={fullBins === 0}
                    className="w-full h-14 bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-[0_10px_20px_rgba(15,23,42,0.2)] flex items-center justify-center gap-3 active:scale-[0.98] transition-all group disabled:opacity-50 disabled:shadow-none hover:bg-slate-800"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-[24px] text-emerald-400 group-active:scale-90 transition-transform">local_shipping</span>
                    <span className="text-sm font-black uppercase tracking-widest">Request Transport</span>
                </button>
            </div>
        </div>
    );
};

export default WarehouseView;

