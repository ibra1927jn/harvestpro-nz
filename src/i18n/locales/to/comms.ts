import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Fakatokanga tuʻunga: {name}',
    'comms.qc_alert_failed': 'Kovi: {criteria}',
    'comms.tl_quality_title': 'Tuʻunga ʻo ʻeku timi he ʻaho ni',
    'comms.tl_quality_count': '{n} sivi · {bad} fakatokanga',
    'comms.tl_quality_empty': 'ʻOku teʻeki ai ha sivi ki hoʻo timi he ʻaho ni',
    'comms.worst_bad': 'Kovi: {criterion}',
    'comms.worst_warn': 'Feʻunga: {criterion}',
    'comms.worst_none': 'Lelei kotoa e ngaahi tuʻunga',
};

export default comms;
