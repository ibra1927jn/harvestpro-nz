import type { TranslationDict } from '../../types';

const fraud: TranslationDict = {
    'fraud.title': 'धोखाधड़ी सुरक्षा',
    'fraud.live': 'लाइव',
    'fraud.demo': 'डेमो',
    'fraud.server_side': 'सर्वर पर जाँच — स्कैन पैटर्न का लाइव विश्लेषण',
    'fraud.intelligent': 'समझदार जाँच — बाग के असली काम को समझती है',
    'fraud.high': 'उच्च',
    'fraud.medium': 'मध्यम',
    'fraud.low': 'कम',
    'fraud.dismissed': 'खारिज',
    'fraud.no_anomalies': 'कोई असामान्यता नहीं मिली',
    'fraud.normal_patterns': 'इस फ़िल्टर के लिए सभी स्कैन पैटर्न सामान्य हैं',
    'fraud.all_flags': 'सभी फ़्लैग',
    'fraud.impossible_rate': 'असंभव दर',
    'fraud.post_pickup': 'पिकअप के बाद',
    'fraud.peer_outlier': 'साथियों से अलग',
    'fraud.off_hours': 'काम के घंटों के बाहर',
    'fraud.duplicates': 'डुप्लिकेट',
    'fraud.inspect_profile': 'प्रोफ़ाइल और इतिहास देखें',
    'fraud.smart_dismissals': 'स्मार्ट खारिज',
    'fraud.scenarios_ignored': 'स्थितियाँ सही तरह अनदेखी — सिस्टम आपके बाग को समझता है',
    'fraud.analyzing': 'स्कैन पैटर्न का विश्लेषण…',
    'fraud.refresh': 'असामान्यताएँ रीफ़्रेश करें',
    'fraud.rule_elapsed': 'नियम 1: बीता समय',
    'fraud.rule_peer': 'नियम 2: साथियों से तुलना',
    'fraud.rule_grace': 'नियम 3: छूट का समय',
    'fraud.rule_elapsed_desc': 'बाल्टियाँ ÷ पिछले कलेक्शन से समय मापता है। पेड़ों के नीचे जमा बाल्टियाँ = सामान्य। पिकअप के बाद असंभव उछाल = अलर्ट।',
    'fraud.rule_peer_desc': 'हर पिकर की तुलना पंक्ति के साथियों से। सब तेज़ = अच्छा पेड़। सिर्फ़ एक तेज़ = संदिग्ध।',
    'fraud.rule_grace_desc': 'पहले 90 मिनट = वार्म-अप। सीढ़ियाँ, ठंडे फल, ट्रैक्टर अभी नहीं। सिस्टम चुपचाप देखता है, सिर्फ़ असंभव गति फ़्लैग करता है।',
};

export default fraud;
