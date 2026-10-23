import type { TranslationDict } from '../../types';

const fraud: TranslationDict = {
    'fraud.title': 'Bouclier anti-fraude',
    'fraud.high': 'Élevé',
    'fraud.medium': 'Moyen',
    'fraud.low': 'Faible',
    'fraud.dismissed': 'Écartés',
    'fraud.no_anomalies': 'Aucune anomalie détectée',
    'fraud.inspect_profile': 'Voir le profil et l’historique',
    'fraud.analyzing': 'Analyse des scans…',
    'fraud.dismissed_today': 'Écartées aujourd’hui',
    'fraud.dismissed_count': '{n} anomalies écartées comme fausses alertes',
    'fraud.dismissed_none': 'Rien d’écarté aujourd’hui.',
    'fraud.dismissed_reason': 'Motif : {reason}',
    'fraud.dismissed_no_reason': 'Sans motif',
    'fraud.undo_dismiss': 'Annuler',
    'fraud.dismiss': 'Écarter',
    'fraud.dismiss_for': 'Écarter {name} comme fausse alerte',
    'fraud.dismiss_prompt': 'Pourquoi est-ce une fausse alerte pour {name} ? (facultatif)',
    'fraud.dismiss_failed': 'Non enregistré. Réessayez.',
};

export default fraud;
