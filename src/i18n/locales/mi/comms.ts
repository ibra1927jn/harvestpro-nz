import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'Whakatūpato kounga: {name}',
    'comms.qc_alert_failed': 'Kino: {criteria}',
    'comms.tl_quality_title': 'Te kounga o taku rōpū i tēnei rā',
    'comms.tl_quality_count': '{n} arotake · {bad} kua tohua',
    'comms.tl_quality_empty': 'Kāore anō he arotake kounga mō tō rōpū i tēnei rā',
    'comms.worst_bad': 'Kino: {criterion}',
    'comms.worst_warn': 'Āhua: {criterion}',
    'comms.worst_none': 'He pai ngā paearu katoa',
};

export default comms;
