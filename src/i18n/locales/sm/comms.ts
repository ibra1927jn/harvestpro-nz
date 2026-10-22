import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Lapataiga lelei: {name}',
    'comms.qc_alert_failed': 'Leaga: {criteria}',
    'comms.tl_quality_title': 'Lelei o laʻu ʻau i le aso',
    'comms.tl_quality_count': '{n} siaki · {bad} lapataʻiga',
    'comms.tl_quality_empty': 'E leʻi i ai ni siaki mo lau ʻau i le aso',
    'comms.worst_bad': 'Leaga: {criterion}',
    'comms.worst_warn': 'Feololo: {criterion}',
    'comms.worst_none': 'Lelei uma tulaga',
};

export default comms;
