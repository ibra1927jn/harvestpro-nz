import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Aviso de calidad: {name}',
    'comms.qc_alert_failed': 'Mal: {criteria}',
    'comms.tl_quality_title': 'Calidad de mi equipo hoy',
    'comms.tl_quality_count': '{n} revisiones · {bad} con aviso',
    'comms.tl_quality_empty': 'Hoy aún no hay inspecciones de tu equipo',
    'comms.worst_bad': 'Mal: {criterion}',
    'comms.worst_warn': 'Regular: {criterion}',
    'comms.worst_none': 'Todos los criterios bien',
};

export default comms;
