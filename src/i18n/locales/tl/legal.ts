import type { TranslationDict } from '../../types';

const legal: TranslationDict = {
    'error.title': 'May nangyaring mali',
    'error.description': 'Nagkaroon ng hindi inaasahang error ang app.',
    'error.reload': 'I-reload ang App',
    'error.clearCache': 'I-clear ang Cache at I-reload',
    'privacy.title': 'Abiso sa Privacy at Pagkolekta ng Data',
    'privacy.subtitle': 'Sa ilalim ng New Zealand Privacy Act 2020, kailangan naming ipaalam sa iyo kung paano kinokolekta, ginagamit, at pinoprotektahan ang iyong personal na impormasyon bago mo gamitin ang system na ito. Basahin nang mabuti ang sumusunod.',
    'privacy.section1.title': '1. Impormasyong Kinokolekta Namin (IPP 1–3)',
    'privacy.section1.body': 'Kinokolekta ng HarvestPro NZ ang sumusunod na personal na impormasyon:\n• Buong pangalan, email address, at contact details\n• Impormasyon sa trabaho: role, uri ng kontrata, visa status, IRD number\n• Data ng trabaho: bilang ng timba/bin, oras ng pag-scan, assignment ng hanay\n• Attendance: oras ng pasok/labas, pagsunod sa break, oras ng trabaho\n• Device identifier para sa offline sync\n• Location data kapag ginagamit ang orchard zone map (opsyonal)\n\nKinokolekta ang impormasyong ito mula sa iyo at sa iyong employer (ang orchard operator) para sa mga layuning nakasaad sa ibaba.',
    'privacy.section2.title': '2. Layunin ng Pagkolekta (IPP 1)',
    'privacy.section2.body': 'Kinokolekta at ginagamit ang iyong personal na impormasyon para sa:\n• Tamang pagkalkula ng sahod, piece rate, at minimum wage top-up ayon sa Employment Relations Act 2000\n• Pagsubaybay sa pagsunod sa legal na pahinga at meal break\n• Paggawa ng payroll report para i-export sa awtorisadong payroll system (Xero, PaySauce)\n• Pagsubaybay sa produktibidad ng ani at operasyon ng taniman\n• Pagtiyak sa kalusugan at kaligtasan sa trabaho\n• Paggawa ng audit trail na kailangan ng mga regulasyon sa trabaho ng NZ',
    'privacy.section3.title': '3. Pag-iimbak at Seguridad (IPP 5)',
    'privacy.section3.body': 'Ang iyong data ay nakaimbak sa:\n• Cloud server na pinapatakbo ng Supabase (PostgreSQL) na may Row-Level Security — data lang ng iyong taniman ang makikita mo\n• Local storage ng device (encrypted IndexedDB gamit ang AES-256) para sa offline\n• Lahat ng pagpapadala ng data ay gumagamit ng TLS 1.3 encryption\n• Kontrolado ang access ng role-based permission at multi-factor authentication para sa mga manager\n• Naka-encrypt sa iyong device ang financial at personal na data',
    'privacy.section4.title': '4. Sino ang May Access (IPP 11)',
    'privacy.section4.body': 'Maaaring ma-access ang iyong personal na impormasyon ng:\n• Iyong itinalagang orchard manager at payroll administrator\n• Mga team leader (attendance at assignment data lang ng kanilang crew)\n• Ang orchard operator para sa legal at regulatory compliance\n• Mga ahensya ng gobyerno kapag hinihingi lang ng batas (hal. Employment NZ, IRD)\n\nHINDI ibebenta, ibabahagi sa advertiser, o ibubunyag sa ibang third party na hindi nakalista sa itaas ang iyong data nang walang malinaw mong pahintulot o legal na pangangailangan.',
    'privacy.section5.title': '5. Ang Iyong mga Karapatan (IPP 6–7)',
    'privacy.section5.body': 'Sa ilalim ng NZ Privacy Act 2020, may karapatan kang:\n• Humiling ng access sa lahat ng personal na impormasyon tungkol sa iyo\n• Humiling ng pagtatama ng maling impormasyon\n• Itanong kung paano ginamit o ibinahagi ang iyong impormasyon\n• Umatras sa hindi mahalagang pagkolekta ng data (hal. location tracking)\n• Magreklamo sa NZ Privacy Commissioner (privacy.org.nz)\n\nPara gamitin ang mga karapatang ito, makipag-ugnayan sa iyong orchard manager o mag-email sa system administrator.',
    'privacy.section6.title': '6. Pagtatago ng Data',
    'privacy.section6.body': 'Itinatago ang employment record nang hindi bababa sa 6 na taon ayon sa Employment Relations Act 2000 at Holidays Act 2003. Pagkatapos nito, maaaring ligtas na burahin o i-anonymize ang mga record.\n\nKapag umalis ka sa trabaho, ide-deactivate ang iyong account pero itatago ang mga record sa panahong itinakda ng batas.',
    'privacy.legalRef': 'Inilabas ang abisong ito alinsunod sa New Zealand Privacy Act 2020 (Information Privacy Principles 1–6), Employment Relations Act 2000, at Holidays Act 2003. Para sa mga tanong, makipag-ugnayan sa NZ Office of the Privacy Commissioner sa privacy.org.nz.',
    'privacy.acceptButton': 'Nabasa Ko at Tinatanggap ang Abisong Ito',
    'privacy.submitting': 'Itinatala ang pahintulot...',
    'privacy.scrollToRead': 'Mag-scroll pababa para mabasa ang buong abiso',
    'privacy.footer': 'Itatala ang iyong pahintulot kasama ang oras. Maaari kang humingi ng kopya ng abisong ito anumang oras.',
    'privacy.error': 'Hindi naitala ang pahintulot. Subukan muli o makipag-ugnayan sa iyong manager.',
};

export default legal;
