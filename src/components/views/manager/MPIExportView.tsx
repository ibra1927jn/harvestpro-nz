/**
 * MPIExportView — MPI Export Compliance UI
 *
 * Shows MPI readiness score, missing fields, and lets managers
 * generate + download traceability reports for NZ export compliance.
 *
 * @module components/views/manager/MPIExportView
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { mpiExportService, type MPIExportBatch } from '@/services/mpi-export.service';
import { addDaysYMD, todayNZST } from '@/utils/nzst';

export default function MPIExportView() {
  const { orchardId } = useAuth();
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    score: number;
    topMissingFields: Array<{ field: string; count: number }>;
  } | null>(null);
  const [batch, setBatch] = useState<MPIExportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: addDaysYMD(todayNZST(), -7),
    end: todayNZST(),
  });

  useEffect(() => {
    if (!orchardId) return;
    mpiExportService
      .checkReadiness(orchardId)
      .then(setReadiness)
      .catch(() => setReadiness(null))
      .finally(() => setLoading(false));
  }, [orchardId]);

  const handleExport = useCallback(async () => {
    if (!orchardId) return;
    setExporting(true);
    try {
      const result = await mpiExportService.generateBatchExport(
        orchardId,
        dateRange.start,
        dateRange.end
      );
      setBatch(result);
    } finally {
      setExporting(false);
    }
  }, [orchardId, dateRange]);

  const handleDownloadCSV = useCallback(() => {
    if (!batch) return;
    const csv = mpiExportService.exportAsCSV(batch);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MPI-Export-${batch.export_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [batch]);

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-60" />
        <div className="h-40 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
        <span aria-hidden="true" className="material-symbols-outlined text-emerald-600">verified</span>
        MPI Export Compliance
      </h2>

      {/* Readiness Score */}
      {readiness && (
        <div
          className={`rounded-2xl p-5 border ${readiness.ready ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Readiness Score</h3>
            <span
              className={`text-3xl font-bold ${readiness.ready ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {readiness.score}%
            </span>
          </div>
          <div className="w-full bg-white/60 rounded-full h-3 mb-3">
            <div
              className={`h-3 rounded-full transition-all ${readiness.ready ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
          {readiness.topMissingFields.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">Missing Fields:</p>
              <div className="flex flex-wrap gap-2">
                {readiness.topMissingFields.slice(0, 5).map(f => (
                  <span key={f.field} className="text-xs bg-white/80 px-2 py-1 rounded-lg border">
                    {f.field.replace(/_/g, ' ')} ({f.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date Range Picker */}
      <div className="bg-white rounded-2xl p-5 border border-border-light shadow-sm">
        <h3 className="font-semibold mb-3">Generate Export</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor="mpi-start-date" className="text-xs text-slate-500 block mb-1">
              Start Date
            </label>
            <input
              id="mpi-start-date"
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label htmlFor="mpi-end-date" className="text-xs text-slate-500 block mb-1">
              End Date
            </label>
            <input
              id="mpi-end-date"
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg">
            {exporting ? 'hourglass_empty' : 'file_export'}
          </span>
          {exporting ? 'Generating...' : 'Generate MPI Report'}
        </button>
      </div>

      {/* Export Results */}
      {batch && (
        <div className="bg-white rounded-2xl p-5 border border-border-light shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Export: {batch.export_id}</h3>
            <span
              className={`text-sm font-medium px-2 py-1 rounded-lg ${batch.compliance_percentage >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
            >
              {batch.compliance_percentage}% Compliant
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className="text-xl font-bold">{batch.total_bins}</p>
              <p className="text-xs text-slate-500">Total Bins</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-xl">
              <p className="text-xl font-bold text-emerald-600">{batch.complete_bins}</p>
              <p className="text-xs text-emerald-500">Complete</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-xl">
              <p className="text-xl font-bold text-amber-600">{batch.incomplete_bins}</p>
              <p className="text-xs text-amber-500">Incomplete</p>
            </div>
          </div>
          <button
            onClick={handleDownloadCSV}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">download</span>
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
