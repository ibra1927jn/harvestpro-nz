/**
 * LiveFloor — Real-time scan activity feed
 */
import React from 'react';
import { BucketRecord, Picker } from '../../../types';

interface LiveFloorProps {
    bucketRecords: BucketRecord[];
    onUserSelect?: (user: Partial<Picker>) => void;
}

const LiveFloor: React.FC<LiveFloorProps> = ({ bucketRecords, onUserSelect }) => (
    <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border-light flex justify-between items-center">
            <h3 className="font-bold text-text-main flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Live Floor
            </h3>
            <span className="text-xs font-bold text-text-muted uppercase">Recent Activity</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
            {bucketRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">
                    No scans recorded yet today.
                </div>
            ) : (
                <div className="divide-y divide-border-light">
                    {bucketRecords.slice(0, 10).map((record: BucketRecord, idx: number) => (
                        <div
                            key={idx}
                            onClick={() => {
                                if (onUserSelect) {
                                    onUserSelect({
                                        id: record.picker_id,
                                        picker_id: record.picker_id,
                                        name: record.picker_name || 'Unknown',
                                        role: 'picker'
                                    });
                                }
                            }}
                            className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer active:scale-[0.99]"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-text-sub">
                                    {record.picker_name ? record.picker_name.substring(0, 1) : '#'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-text-main">{record.picker_name || 'Unknown Picker'}</p>
                                    <p className="text-[10px] text-slate-500 font-medium">Row {record.row_number || '--'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                                    Bucket +1
                                </span>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {new Date(record.created_at || Date.now()).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
);

export default React.memo(LiveFloor);
