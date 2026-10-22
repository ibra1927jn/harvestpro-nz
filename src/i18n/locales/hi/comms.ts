import type { TranslationDict } from '../../types';

/** Comunicación entre roles: avisos de calidad, ausencias, presencia, avisos dirigidos (auditoría 23-10, C) */
const comms: TranslationDict = {
    'comms.qc_alert_title': 'गुणवत्ता चेतावनी: {name}',
    'comms.qc_alert_failed': 'खराब: {criteria}',
    'comms.tl_quality_title': 'आज मेरी टीम की गुणवत्ता',
    'comms.tl_quality_count': '{n} जाँच · {bad} चेतावनी',
    'comms.tl_quality_empty': 'आज अभी तक आपकी टीम की कोई जाँच नहीं',
    'comms.worst_bad': 'खराब: {criterion}',
    'comms.worst_warn': 'ठीक-ठाक: {criterion}',
    'comms.worst_none': 'सभी मानदंड अच्छे',
};

export default comms;
