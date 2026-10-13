import type { TranslationDict } from '../../types';

const fraud: TranslationDict = {
    'fraud.title': 'Proteksyon sa Pandaraya',
    'fraud.live': 'Live',
    'fraud.demo': 'Demo',
    'fraud.server_side': 'Server-side na pagsusuri — live na pag-aaral ng scan pattern',
    'fraud.intelligent': 'Matalinong pagsusuri — naiintindihan ang tunay na trabaho sa taniman',
    'fraud.high': 'Mataas',
    'fraud.medium': 'Katamtaman',
    'fraud.low': 'Mababa',
    'fraud.dismissed': 'Binalewala',
    'fraud.no_anomalies': 'Walang anomalya',
    'fraud.normal_patterns': 'Normal ang lahat ng scan pattern sa filter na ito',
    'fraud.all_flags': 'Lahat ng Flag',
    'fraud.impossible_rate': 'Imposibleng Bilis',
    'fraud.post_pickup': 'Pagkatapos ng Pickup',
    'fraud.peer_outlier': 'Iba sa Kasama',
    'fraud.off_hours': 'Labas sa Oras',
    'fraud.duplicates': 'Duplicate',
    'fraud.inspect_profile': 'Suriin ang Profile at History',
    'fraud.smart_dismissals': 'Matalinong Pagbalewala',
    'fraud.scenarios_ignored': 'sitwasyong tamang binalewala — naiintindihan ng system ang iyong taniman',
    'fraud.analyzing': 'Sinusuri ang scan pattern…',
    'fraud.refresh': 'I-refresh',
    'fraud.rule_elapsed': 'Patakaran 1: Lumipas na Oras',
    'fraud.rule_peer': 'Patakaran 2: Paghahambing sa Kasama',
    'fraud.rule_grace': 'Patakaran 3: Grace Period',
    'fraud.rule_elapsed_desc': 'Sinusukat ang timba ÷ oras mula sa huling kuha. Naipong timba sa ilalim ng puno = normal. Imposibleng pagtaas matapos ang pickup = alerto.',
    'fraud.rule_peer_desc': 'Ikinukumpara ang bawat picker sa kasama sa hanay. Mabilis lahat = magandang puno. ISA lang ang mabilis = kahina-hinala.',
    'fraud.rule_grace_desc': 'Unang 90 min = warmup. Hagdan, malamig na prutas, wala pang traktora. Tahimik na nagmamasid ang system, tanging imposibleng bilis ang mina-flag.',
};

export default fraud;
