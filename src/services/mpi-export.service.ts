/**
 * MPI Export Service — Ministry for Primary Industries traceability
 *
 * Generates traceability reports required by New Zealand MPI for
 * exported fruit. Covers origin tracking, quality grades, harvest
 * dates, picker information, and cold chain records.
 *
 * @module services/mpi-export.service
 * @see https://www.mpi.govt.nz/export/food-exporters/
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { nzMidnight, nzEndOfDay } from '@/utils/nzst';

// =============================================
// TYPES
// =============================================

export interface MPITraceRecord {
  bin_id: string;
  orchard_id: string;
  orchard_name: string;
  block_name: string;
  row_numbers: number[];
  variety: string;
  harvest_date: string;
  harvest_time: string;
  picker_ids: string[];
  picker_names: string[];
  quality_grade: string;
  weight_kg: number | null;
  bucket_count: number;
  coolstore_entry_at: string | null;
  packhouse_receipt_at: string | null;
  export_lot_id: string | null;
  completeness_score: number; // 0-100%
  missing_fields: string[];
}

export interface MPIExportBatch {
  export_id: string;
  orchard_id: string;
  generated_at: string;
  date_range: { start: string; end: string };
  total_bins: number;
  complete_bins: number;
  incomplete_bins: number;
  records: MPITraceRecord[];
  compliance_percentage: number;
}

// =============================================
// SERVICE
// =============================================

export const mpiExportService = {
  /**
   * Generate MPI traceability data for a single bin.
   * Pulls data from bucket_records, pickers, orchard_blocks, and QC inspections.
   */
  async generateBinTrace(binId: string, orchardId: string): Promise<MPITraceRecord | null> {
    try {
      // Get bin's bucket records
      const { data: buckets, error: bucketError } = await supabase
        .from('bucket_records')
        .select(
          `
                    id, picker_id, scanned_at, quality_grade, row_number,
                    pickers!inner(id, full_name),
                    orchards!inner(id, name)
                `
        )
        .eq('orchard_id', orchardId)
        .eq('bin_id', binId);

      if (bucketError || !buckets?.length) {
        logger.warn(`[MPI] No bucket records found for bin ${binId}`);
        return null;
      }

      // Get block info
      const { data: block } = await supabase
        .from('orchard_blocks')
        .select('name, variety')
        .eq('orchard_id', orchardId)
        .limit(1)
        .maybeSingle();

      // Aggregate picker information
      const pickerMap = new Map<string, string>();
      const rowSet = new Set<number>();
      let earliestScan = '';
      let latestScan = '';
      const gradeMap = new Map<string, number>();

      for (const b of buckets) {
        pickerMap.set(
          b.picker_id,
          (b as unknown as Record<string, Record<string, string>>).pickers?.full_name || 'Unknown'
        );
        if (b.row_number) rowSet.add(b.row_number);
        if (!earliestScan || b.scanned_at < earliestScan) earliestScan = b.scanned_at;
        if (!latestScan || b.scanned_at > latestScan) latestScan = b.scanned_at;
        const grade = b.quality_grade || 'ungraded';
        gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
      }

      // Determine dominant grade
      let dominantGrade = 'ungraded';
      let maxCount = 0;
      for (const [grade, count] of gradeMap) {
        if (count > maxCount) {
          dominantGrade = grade;
          maxCount = count;
        }
      }

      // Calculate completeness
      const missing: string[] = [];
      if (!block?.variety) missing.push('variety');
      if (rowSet.size === 0) missing.push('row_numbers');
      if (dominantGrade === 'ungraded') missing.push('quality_grade');
      // Future: weight_kg, coolstore_entry, packhouse_receipt
      missing.push('weight_kg', 'coolstore_entry', 'packhouse_receipt');

      const totalFields = 10;
      const completeness = Math.round(((totalFields - missing.length) / totalFields) * 100);

      const orchardData = buckets[0] as Record<string, unknown>;

      return {
        bin_id: binId,
        orchard_id: orchardId,
        orchard_name: (orchardData.orchards as Record<string, string>)?.name || 'Unknown',
        block_name: block?.name || 'Unknown',
        row_numbers: Array.from(rowSet).sort((a, b) => a - b),
        variety: block?.variety || 'Unknown',
        harvest_date: earliestScan.split('T')[0],
        harvest_time: earliestScan.split('T')[1]?.split('.')[0] || '',
        picker_ids: Array.from(pickerMap.keys()),
        picker_names: Array.from(pickerMap.values()),
        quality_grade: dominantGrade,
        weight_kg: null, // Future: from Bluetooth scale
        bucket_count: buckets.length,
        coolstore_entry_at: null, // Future: from coolstore integration
        packhouse_receipt_at: null, // Future: from packhouse integration
        export_lot_id: null, // Future: from export management
        completeness_score: completeness,
        missing_fields: missing,
      };
    } catch (error) {
      logger.error(`[MPI] Failed to generate trace for bin ${binId}:`, error);
      return null;
    }
  },

  /**
   * Generate a batch MPI export for a date range.
   * Returns all bins harvested in the period with traceability data.
   */
  async generateBatchExport(
    orchardId: string,
    startDate: string,
    endDate: string
  ): Promise<MPIExportBatch> {
    logger.info(`[MPI] Generating batch export for ${orchardId}: ${startDate} to ${endDate}`);

    // Get unique bin IDs in the date range
    // Paginado (una semana son ~20.000 cubetas: se exportaban solo los bins de
    // las primeras 1000) y con días NZ completos: una fecha sola la lee Postgres
    // como medianoche UTC = 13:00 en NZ. Prueba de carga 2026-10-21.
    const fromIso = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? nzMidnight(startDate) : startDate;
    const toIso = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? nzEndOfDay(endDate) : endDate;
    const binRecords = await fetchAllRows<{ bin_id: string | null }>((from, to) =>
      supabase
        .from('bucket_records')
        .select('bin_id')
        .eq('orchard_id', orchardId)
        .is('deleted_at', null)
        .gte('scanned_at', fromIso)
        .lte('scanned_at', toIso)
        .not('bin_id', 'is', null)
        .order('id')
        .range(from, to)
    );

    const uniqueBinIds = [...new Set(binRecords.map(r => r.bin_id).filter(Boolean))] as string[];

    // Generate traces for each bin
    const records: MPITraceRecord[] = [];
    for (const binId of uniqueBinIds) {
      const trace = await this.generateBinTrace(binId, orchardId);
      if (trace) records.push(trace);
    }

    const completeBins = records.filter(r => r.completeness_score >= 80).length;
    const exportId = `MPI-${orchardId.slice(0, 8)}-${Date.now()}`;

    // Log the export to audit trail.
    // Bug fix 2026-04-19: was 'audit_log' (singular, does not exist) — silent fail.
    // Schema-correct columns: action (NOT NULL), table_name (NOT NULL), new_data (jsonb).
    const { error: auditErr } = await supabase.from('audit_logs').insert({
      action: 'mpi_export',
      table_name: 'audit_mpi_exports',
      user_id: null,
      new_data: {
        orchard_id: orchardId,
        export_id: exportId,
        date_range: { start: startDate, end: endDate },
        total_bins: records.length,
        complete_bins: completeBins,
      },
    });
    if (auditErr) {
      logger.warn('[MPIExport] audit_logs insert failed:', auditErr.message);
    }

    return {
      export_id: exportId,
      orchard_id: orchardId,
      generated_at: new Date().toISOString(),
      date_range: { start: startDate, end: endDate },
      total_bins: records.length,
      complete_bins: completeBins,
      incomplete_bins: records.length - completeBins,
      records,
      compliance_percentage:
        records.length > 0 ? Math.round((completeBins / records.length) * 100) : 0,
    };
  },

  /**
   * Check MPI readiness — returns a summary of which fields are missing
   * across all recent bins.
   */
  async checkReadiness(orchardId: string): Promise<{
    ready: boolean;
    score: number;
    topMissingFields: Array<{ field: string; count: number }>;
  }> {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const batch = await this.generateBatchExport(orchardId, startDate, endDate);

    const fieldCounts = new Map<string, number>();
    for (const record of batch.records) {
      for (const field of record.missing_fields) {
        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
      }
    }

    const topMissing = Array.from(fieldCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ready: batch.compliance_percentage >= 80,
      score: batch.compliance_percentage,
      topMissingFields: topMissing,
    };
  },

  /**
   * Export MPI data as CSV for download.
   */
  exportAsCSV(batch: MPIExportBatch): string {
    const headers = [
      'Bin ID',
      'Orchard',
      'Block',
      'Variety',
      'Rows',
      'Harvest Date',
      'Harvest Time',
      'Pickers',
      'Grade',
      'Bucket Count',
      'Weight (kg)',
      'Coolstore Entry',
      'Packhouse Receipt',
      'Completeness %',
    ];

    const rows = batch.records.map(r => [
      r.bin_id,
      r.orchard_name,
      r.block_name,
      r.variety,
      r.row_numbers.join(';'),
      r.harvest_date,
      r.harvest_time,
      r.picker_names.join(';'),
      r.quality_grade,
      r.bucket_count,
      r.weight_kg || '',
      r.coolstore_entry_at || '',
      r.packhouse_receipt_at || '',
      r.completeness_score,
    ]);

    return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join(
      '\n'
    );
  },
};
