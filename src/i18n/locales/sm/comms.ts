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
    'comms.on_leave': 'I le malologa',
    'comms.on_leave_type': 'I le malologa ({type})',
    'comms.leave_request_for': 'Talosaga malologa mo {name}',
    'comms.leave_request_title': 'Malologa mo {name}',
    'comms.leave_request_hint': 'O le HR e faʻamaonia pe teʻena. A leai se fesoʻotaʻiga, e lafo pe a toe foʻi mai.',
    'comms.leave_send': 'Lafo le talosaga',
    'comms.leave_sent': 'Ua lafo le talosaga malologa mo {name} i le HR',
    'comms.leave_queued': 'Leai se fesoʻotaʻiga: o le a lafo le talosaga malologa mo {name} pe a toe foʻi mai',
    'comms.leave_not_saved': 'E leʻi teuina le talosaga malologa mo {name}',
    'comms.my_leave_title': 'Malologa na ou talosagaina',
    'comms.leave_status_queued': 'Faʻatali mo le fesoʻotaʻiga',
    'comms.leave_status_requested': 'Faʻatali i le HR',
    'comms.leave_status_approved': 'Ua faʻamaonia',
    'comms.leave_status_rejected': 'Ua teʻena',
    'comms.leave_status_cancelled': 'Ua faʻaleaogaina',
    'comms.ts_on_leave_title': 'I le malologa faʻamaonia i le aso: {n}',
    'comms.ts_on_leave_hint': 'O le polokalame totogi e fuafua le totogi o le malologa, ae le o iinei.',
    'sync.type.leave_request': 'Talosaga malologa',
};

export default comms;
