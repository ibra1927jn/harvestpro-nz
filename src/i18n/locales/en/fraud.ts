import type { TranslationDict } from '../../types';

const fraud: TranslationDict = {
    'fraud.title': 'Fraud Shield',
    'fraud.high': 'High',
    'fraud.medium': 'Medium',
    'fraud.low': 'Low',
    'fraud.dismissed': 'Dismissed',
    'fraud.no_anomalies': 'No anomalies detected',
    'fraud.inspect_profile': 'Inspect Profile & History',
    'fraud.analyzing': 'Analyzing scan patterns…',
    'fraud.dismissed_today': 'Dismissed today',
    'fraud.dismissed_count': '{n} anomalies dismissed as false alarms',
    'fraud.dismissed_none': 'Nothing dismissed today.',
    'fraud.dismissed_reason': 'Reason: {reason}',
    'fraud.dismissed_no_reason': 'No reason given',
    'fraud.undo_dismiss': 'Undo',
    'fraud.dismiss': 'Dismiss',
    'fraud.dismiss_for': 'Dismiss {name} as a false alarm',
    'fraud.dismiss_prompt': 'Why is this a false alarm for {name}? (optional)',
    'fraud.dismiss_failed': 'Not saved. Try again.',
};

export default fraud;
