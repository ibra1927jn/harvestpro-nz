import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Babala sa kalidad: {name}',
    'comms.qc_alert_failed': 'Masama: {criteria}',
    'comms.tl_quality_title': 'Kalidad ng aking team ngayon',
    'comms.tl_quality_count': '{n} tsek · {bad} may babala',
    'comms.tl_quality_empty': 'Wala pang inspeksyon sa team mo ngayon',
    'comms.worst_bad': 'Masama: {criterion}',
    'comms.worst_warn': 'Katamtaman: {criterion}',
    'comms.worst_none': 'Maayos lahat ng pamantayan',
};

export default comms;
