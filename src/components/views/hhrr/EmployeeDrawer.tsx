/**
 * EmployeeDrawer — ficha de una persona en RRHH › Employees (auditoría 2026-10-23, E).
 *
 * Antes la fila y la flecha no abrían nada. Reúne lo que RRHH ya tiene:
 * contrato vigente (de la lista), documentos (hr_documents), ausencias
 * (leave_requests) y el semáforo «qué falta» para el alta completa.
 */
import React, { useEffect, useState } from 'react';
import Drawer from '@/components/ui/Drawer';
import type { Employee } from '@/services/hhrr.service';
import { leaveService, type LeaveRequest } from '@/services/leave.service';
import { hrDocumentsRepository, type HRDocumentRow } from '@/repositories/hr-documents.repository';
import { docTypeLabel } from './docTypeLabel';
import { roleLabel } from '@/i18n/roleLabel';
import { statusLabel } from '@/i18n/statusLabel';
import { useTranslation } from '@/i18n';
import { formatNZD, formatNZDate } from '@/utils/nzFormat';
import { logger } from '@/utils/logger';

interface EmployeeDrawerProps {
    employee: Employee | null;
    onClose: () => void;
}

const EmployeeDrawer: React.FC<EmployeeDrawerProps> = ({ employee, onClose }) => {
    const { t } = useTranslation();
    const [docs, setDocs] = useState<HRDocumentRow[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!employee) return;
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        Promise.all([hrDocumentsRepository.listByPerson(employee.id), leaveService.listByPerson(employee.id)])
            .then(([d, l]) => { if (!cancelled) { setDocs(d); setLeaves(l); } })
            .catch(e => { logger.warn('[HR] Could not load the person file:', e); if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employee]);

    if (!employee) return null;
    const hasContract = !!employee.contract_id;

    return (
        <Drawer isOpen={!!employee} onClose={onClose} title={employee.full_name} icon="badge">
            <div className="space-y-5 p-1" data-testid="employee-drawer">
                <p className="text-sm text-text-secondary">
                    {roleLabel(t, employee.role)}{employee.email ? ` · ${employee.email}` : ''}
                </p>

                <section>
                    <h4 className="text-xs font-bold uppercase text-text-muted mb-2">{t('hr.file.contract')}</h4>
                    {hasContract ? (
                        <dl className="grid grid-cols-2 gap-y-1 text-sm">
                            <dt className="text-text-secondary">{t('hr.contract_type')}</dt>
                            <dd>{statusLabel(t, employee.contract_type)}</dd>
                            <dt className="text-text-secondary">{t('hr.file.from')}</dt>
                            <dd>{formatNZDate(employee.contract_start, 'medium')}</dd>
                            <dt className="text-text-secondary">{t('hr.file.to')}</dt>
                            <dd>{employee.contract_end ? formatNZDate(employee.contract_end, 'medium') : t('hr.file.open_ended')}</dd>
                            <dt className="text-text-secondary">{t('hr.file.rate')}</dt>
                            <dd>{formatNZD(employee.hourly_rate)}/h</dd>
                            <dt className="text-text-secondary">{t('hr.file.signed_copy')}</dt>
                            <dd>{employee.contract_document ? t('hr.file.yes') : t('hr.file.no')}</dd>
                        </dl>
                    ) : (
                        <p className="text-sm text-amber-700">{t('hr.missing.contract')}</p>
                    )}
                </section>

                <section>
                    <h4 className="text-xs font-bold uppercase text-text-muted mb-2">{t('hr.file.missing')}</h4>
                    {employee.missing_items && employee.missing_items.length > 0 ? (
                        <ul className="flex flex-wrap gap-1" data-testid="employee-missing">
                            {employee.missing_items.map(item => (
                                <li key={item} className="px-2 py-0.5 rounded-md text-xs font-bold border bg-amber-50 text-amber-700 border-amber-200">{t(`hr.missing.${item}`)}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-emerald-700">{t('hr.missing.none')}</p>
                    )}
                </section>

                {loading && <p className="text-sm text-text-muted">{t('hr.file.loading')}</p>}
                {failed && <p role="alert" className="text-sm text-red-700">{t('hr.file.load_failed')}</p>}

                {!loading && !failed && (
                    <>
                        <section>
                            <h4 className="text-xs font-bold uppercase text-text-muted mb-2">{t('hr.file.documents', { n: docs.length })}</h4>
                            {docs.length === 0 ? <p className="text-sm text-text-muted">{t('hr.file.no_documents')}</p> : (
                                <ul className="space-y-1 text-sm">
                                    {docs.map(d => (
                                        <li key={d.id} className="flex justify-between gap-2">
                                            <span>{docTypeLabel(t, d.document_type)}</span>
                                            <span className="text-text-secondary">{d.expires_at ? t('hr.file.expires', { date: formatNZDate(d.expires_at, 'medium') }) : formatNZDate(d.uploaded_at, 'medium')}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        <section>
                            <h4 className="text-xs font-bold uppercase text-text-muted mb-2">{t('hr.file.leave', { n: leaves.length })}</h4>
                            {leaves.length === 0 ? <p className="text-sm text-text-muted">{t('hr.file.no_leave')}</p> : (
                                <ul className="space-y-1 text-sm">
                                    {leaves.map(l => (
                                        <li key={l.id} className="flex justify-between gap-2">
                                            <span>{t(`leave.type.${l.type}`)} · {formatNZDate(l.start_date, 'dayMonth')}{l.end_date !== l.start_date ? ` → ${formatNZDate(l.end_date, 'dayMonth')}` : ''}</span>
                                            <span className="text-text-secondary">{statusLabel(t, l.status)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </>
                )}
            </div>
        </Drawer>
    );
};

export default EmployeeDrawer;
