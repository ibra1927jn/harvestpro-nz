/**
 * AuditLogViewer Component
 * 
 * Displays audit trail for managers with filtering and export capabilities
 */

import React, { useState } from 'react';
import { useAuditLogs, type AuditFilters } from '../hooks/useAuditLogs';
import { format } from 'date-fns';

import { toNZST } from '@/utils/nzst';

export function AuditLogViewer() {
    const [filters, setFilters] = useState<AuditFilters>({
        fromDate: toNZST(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        tableName: '',
        action: undefined,
        limit: 100,
    });

    const [selectedLog, setSelectedLog] = useState<string | null>(null);

    const { logs, isLoading, refetch } = useAuditLogs(filters);

    // Export logs to CSV
    const exportToCSV = () => {
        const headers = ['Date', 'User', 'Action', 'Table', 'Record ID'];
        const rows = logs.map((log) => [
            format(new Date(log.created_at), 'PPpp'),
            log.user_email || 'System',
            log.action,
            log.table_name,
            log.record_id || 'N/A',
        ]);

        const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="audit-log-viewer p-4 bg-white rounded-lg shadow">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-2xl">description</span>
                    Audit Trail
                </h2>
                <p className="text-text-secondary mt-1">
                    Complete history of all critical system changes
                </p>
            </div>

            {/* Filters */}
            <div className="filters mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Table Filter */}
                <div>
                    <label className="block text-sm font-medium mb-1">Table</label>
                    <select
                        aria-label="Filter by table name"
                        value={filters.tableName || ''}
                        onChange={(e) => setFilters({ ...filters, tableName: e.target.value || undefined })}
                        className="w-full px-3 py-2 border border-border-medium rounded-md"
                    >
                        <option value="">All Tables</option>
                        <option value="pickers">Pickers</option>
                        <option value="settings">Settings</option>
                        <option value="users">Users</option>
                        <option value="daily_attendance">Attendance</option>
                        <option value="orchards">Orchards</option>
                    </select>
                </div>

                {/* Action Filter */}
                <div>
                    <label className="block text-sm font-medium mb-1">Action</label>
                    <select
                        aria-label="Filter by action type"
                        value={filters.action || ''}
                        onChange={(e) =>
                            setFilters({
                                ...filters,
                                action: (e.target.value as AuditFilters['action']) || undefined,
                            })
                        }
                        className="w-full px-3 py-2 border border-border-medium rounded-md"
                    >
                        <option value="">All Actions</option>
                        <option value="INSERT">Insert</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                        <option value="CUSTOM">Custom</option>
                    </select>
                </div>

                {/* From Date Filter */}
                <div>
                    <label className="block text-sm font-medium mb-1">From Date</label>
                    <input
                        type="date"
                        aria-label="Filter from date"
                        value={filters.fromDate ? format(new Date(filters.fromDate), 'yyyy-MM-dd') : ''}
                        onChange={(e) =>
                            setFilters({
                                ...filters,
                                fromDate: e.target.value ? toNZST(new Date(e.target.value)) : undefined,
                            })
                        }
                        className="w-full px-3 py-2 border border-border-medium rounded-md"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-end gap-2">
                    <button
                        onClick={() => { refetch(); }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                        disabled={isLoading}
                    >
                        <span aria-hidden="true" className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
                        Refresh
                    </button>
                    <button
                        onClick={exportToCSV}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                        disabled={logs.length === 0}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">download</span>
                        Export
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-text-secondary">Loading audit logs...</p>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && logs.length === 0 && (
                <div className="text-center py-12">
                    <span aria-hidden="true" className="material-symbols-outlined text-5xl mx-auto text-text-muted mb-4">description</span>
                    <p className="text-text-secondary">No audit logs found for the selected filters</p>
                </div>
            )}

            {/* Logs Table */}
            {!isLoading && logs.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border-light">
                        <thead className="bg-background-light">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm inline mr-1">calendar_today</span>
                                    Date & Time
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm inline mr-1">person</span>
                                    User
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    Action
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    <span aria-hidden="true" className="material-symbols-outlined text-sm inline mr-1">description</span>
                                    Table
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    Details
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-border-light">
                            {logs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-background-light">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                                            {format(new Date(log.created_at), 'PPpp')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                                            {log.user_email || (
                                                <span className="text-text-muted italic">System</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-1 text-xs font-semibold rounded-full ${log.action === 'INSERT'
                                                    ? 'bg-green-100 text-green-800'
                                                    : log.action === 'UPDATE'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : log.action === 'DELETE'
                                                            ? 'bg-red-100 text-red-800'
                                                            : 'bg-purple-100 text-purple-800'
                                                    }`}
                                            >
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                                            <code className="bg-surface-secondary px-2 py-1 rounded">
                                                {log.table_name}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {(log.action === 'UPDATE' || log.action === 'INSERT') && log.new_values && (
                                                <button
                                                    onClick={() =>
                                                        setSelectedLog(selectedLog === log.id ? null : log.id)
                                                    }
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    <span aria-hidden="true" className="material-symbols-outlined text-sm">visibility</span>
                                                    {selectedLog === log.id ? 'Hide' : 'View'} Changes
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {selectedLog === log.id && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-4 bg-background-light">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {log.old_values && (
                                                        <div>
                                                            <h4 className="font-semibold mb-2 text-red-700">
                                                                Old Values:
                                                            </h4>
                                                            <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
                                                                {JSON.stringify(log.old_values, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {log.new_values && (
                                                        <div>
                                                            <h4 className="font-semibold mb-2 text-green-700">
                                                                New Values:
                                                            </h4>
                                                            <pre className="bg-white p-3 rounded border text-xs overflow-x-auto">
                                                                {JSON.stringify(log.new_values, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>

                    {/* Results Count */}
                    <div className="mt-4 text-sm text-text-secondary">
                        Showing {logs.length} audit log{logs.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}
        </div>
    );
}
