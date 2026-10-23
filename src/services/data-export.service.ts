/**
 * Data Export Service — NZ Privacy Act 2020 IPP 6
 *
 * Information Privacy Principle 6 grants individuals the right to
 * access their personal information. This service provides:
 * - Export of all user-related data (profile, attendance, bucket scans, payroll)
 * - Data returned as JSON (machine-readable) or downloadable
 * - Audit logging of every export request
 *
 * Audit fix M-3: Implements the data access rights required by IPP 6.
 *
 * @module services/data-export.service
 * @see https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html
 */

import { supabase } from './supabase';
import { logger } from '@/utils/logger';
import { fetchAllRows } from '@/utils/fetchAllRows';

export interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    role: string;
    name: string;
    created_at: string;
    privacy_consent_at: string | null;
  };
  attendance: Array<{
    id: string;
    check_in: string;
    check_out: string | null;
    orchard_name: string;
  }>;
  bucketScans: Array<{
    id: string;
    scanned_at: string;
    quality_grade: string | null;
    orchard_id: string;
  }>;
  consentHistory: Array<{
    consent_type: string;
    policy_version: string;
    consented_at: string;
  }>;
  messageCount: number;
}

/** Nombre del huerto (relación orchards) o, si no se pudo leer, su id */
function orchardName(row: Record<string, unknown>): string {
  const rel = row.orchards as { name?: unknown } | Array<{ name?: unknown }> | null | undefined;
  const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
  return typeof name === 'string' ? name : (row.orchard_id as string);
}

export const dataExportService = {
  /**
   * Export all personal data for the authenticated user.
   * Required by NZ Privacy Act 2020, IPP 6.
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    logger.info(`[DataExport] Export requested for user ${userId}`);

    try {
      // 1. Fetch user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, role, full_name, created_at, privacy_consent_at')
        .eq('id', userId)
        .single();

      if (userError) throw new Error(`Failed to fetch user data: ${userError.message}`);

      // 2. Fetch attendance records
      const { data: attendance, error: attendanceError } = await supabase
        .from('daily_attendance')
        .select('id, check_in, check_out, orchard_id, orchards(name)')
        .eq('picker_id', userId)
        .order('check_in', { ascending: false })
        .limit(1000);

      if (attendanceError) {
        logger.warn('[DataExport] Failed to fetch attendance:', attendanceError);
      }

      // 3. Cubos escaneados (la tabla es bucket_records; 'bucket_scans' no existe)
      // Todas (una temporada son ~3.500 por persona; .limit(5000) no sirve:
      // PostgREST corta igual en 1000). Exportación legal: tiene que estar completa.
      let scans: { id: string; scanned_at: string | null; quality_grade: string | null; orchard_id: string | null }[] = [];
      try {
        scans = await fetchAllRows((from, to) =>
          supabase
            .from('bucket_records')
            .select('id, scanned_at, quality_grade, orchard_id')
            .eq('picker_id', userId)
            .order('scanned_at', { ascending: false })
            .order('id')
            .range(from, to)
        );
      } catch (scansError) {
        logger.warn('[DataExport] Failed to fetch scans:', scansError);
      }

      // 4. Fetch consent history (from immutable log)
      const { data: consents, error: consentsError } = await supabase
        .from('privacy_consent_log')
        .select('consent_type, policy_version, consented_at')
        .eq('user_id', userId)
        .order('consented_at', { ascending: false });

      if (consentsError) {
        logger.warn('[DataExport] Failed to fetch consent history:', consentsError);
      }

      // 5. Nº de mensajes enviados, sin contenido (chat_messages; la tabla antigua messages se borró)
      const { count: messageCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', userId);

      const exportData: UserDataExport = {
        exportedAt: new Date().toISOString(),
        user: {
          id: userData.id,
          email: userData.email,
          role: userData.role,
          name: userData.full_name,
          created_at: userData.created_at,
          privacy_consent_at: userData.privacy_consent_at,
        },
        attendance: (attendance || []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          check_in: a.check_in as string,
          check_out: a.check_out as string | null,
          orchard_name: orchardName(a),
        })),
        bucketScans: (scans || []).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          scanned_at: s.scanned_at as string,
          quality_grade: s.quality_grade as string | null,
          orchard_id: s.orchard_id as string,
        })),
        consentHistory: (consents || []).map((c: Record<string, unknown>) => ({
          consent_type: c.consent_type as string,
          policy_version: c.policy_version as string,
          consented_at: c.consented_at as string,
        })),
        messageCount: messageCount ?? 0,
      };

      // 6. Registro de auditoría. audit_logs.action solo admite INSERT/UPDATE/DELETE/CUSTOM:
      // el evento va como CUSTOM y su nombre en new_values.event (como _shared/audit.ts)
      const { error: auditError } = await supabase.from('audit_logs').insert({
        action: 'CUSTOM',
        table_name: 'users',
        record_id: userId,
        user_id: userId,
        new_values: {
          event: 'data_export',
          reason: 'User requested personal data export (IPP 6)',
          records_exported: {
            attendance: exportData.attendance.length,
            scans: exportData.bucketScans.length,
            consents: exportData.consentHistory.length,
          },
        },
      });
      if (auditError) logger.warn('[DataExport] Audit log insert failed:', auditError);

      // Track analytics
      // Track export completion (using logger since analytics doesn't expose raw capture)
      logger.info('[DataExport] Export completed', {
        records: exportData.attendance.length + exportData.bucketScans.length,
      });

      return exportData;
    } catch (error) {
      logger.error('[DataExport] Export failed:', error);
      throw error;
    }
  },

  /**
   * Download user data as a JSON file.
   */
  async downloadAsJSON(userId: string): Promise<void> {
    const data = await this.exportUserData(userId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harvestpro-data-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
