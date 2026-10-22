import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Quality alert: {name}',
    'comms.qc_alert_failed': 'Failed: {criteria}',
    'comms.tl_quality_title': 'My team\'s quality today',
    'comms.tl_quality_count': '{n} checks · {bad} flagged',
    'comms.tl_quality_empty': 'No quality checks for your team yet today',
    'comms.worst_bad': 'Bad: {criterion}',
    'comms.worst_warn': 'So-so: {criterion}',
    'comms.worst_none': 'All criteria good',
};

export default comms;
