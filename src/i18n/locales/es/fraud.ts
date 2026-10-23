import type { TranslationDict } from '../../types';

const fraud: TranslationDict = {
    'fraud.title': 'Escudo Anti-Fraude',
    'fraud.high': 'Alto',
    'fraud.medium': 'Medio',
    'fraud.low': 'Bajo',
    'fraud.dismissed': 'Descartados',
    'fraud.no_anomalies': 'No se detectaron anomalías',
    'fraud.inspect_profile': 'Ver Perfil e Historial',
    'fraud.analyzing': 'Analizando patrones de escaneo…',
    'fraud.dismissed_today': 'Descartadas hoy',
    'fraud.dismissed_count': '{n} anomalías descartadas como falsa alarma',
    'fraud.dismissed_none': 'Hoy no se ha descartado nada.',
    'fraud.dismissed_reason': 'Motivo: {reason}',
    'fraud.dismissed_no_reason': 'Sin motivo',
    'fraud.undo_dismiss': 'Deshacer',
    'fraud.dismiss': 'Descartar',
    'fraud.dismiss_for': 'Descartar {name} como falsa alarma',
    'fraud.dismiss_prompt': '¿Por qué es falsa alarma para {name}? (opcional)',
    'fraud.dismiss_failed': 'No se guardó. Inténtalo otra vez.',
};

export default fraud;
