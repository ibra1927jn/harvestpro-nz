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
    'comms.on_leave': 'I te wehe',
    'comms.on_leave_type': 'I te wehe ({type})',
    'comms.leave_request_for': 'Tono wehe mō {name}',
    'comms.leave_request_title': 'Wehe mō {name}',
    'comms.leave_request_hint': 'Mā HR e whakaae, e whakakāhore rānei. Ki te kore he tohu, ka tukuna ina hoki mai.',
    'comms.leave_send': 'Tukuna te tono',
    'comms.leave_sent': 'Kua tukuna te tono wehe mō {name} ki HR',
    'comms.leave_queued': 'Kāore he tohu: ka tukuna te tono wehe mō {name} ina hoki mai te tohu',
    'comms.leave_not_saved': 'Kāore i tiakina te tono wehe mō {name}',
    'comms.my_leave_title': 'Ngā wehe i tonoa e au',
    'comms.leave_status_queued': 'E tatari ana ki te tohu',
    'comms.leave_status_requested': 'E tatari ana ki HR',
    'comms.leave_status_approved': 'Kua whakaaetia',
    'comms.leave_status_rejected': 'Kua whakakāhoretia',
    'comms.leave_status_cancelled': 'Kua whakakorea',
    'comms.ts_on_leave_title': 'I te wehe kua whakaaetia i tēnei rā: {n}',
    'comms.ts_on_leave_hint': 'Mā te hōtaka utu e tātai te utu wehe, ehara i konei.',
    'sync.type.leave_request': 'Tono wehe',
};

export default comms;
