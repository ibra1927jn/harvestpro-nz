import type { TranslationDict } from '../../types';

/** timesheet, sync, pwa — small namespaces grouped together */
const misc: TranslationDict = {
    // Timesheet
    'timesheet.title': 'Éditeur de feuilles d’heures',
    'timesheet.attendance': 'Registre de présence',
    'timesheet.hours': 'Heures',
    // Sync Errors
    'sync.title': 'Erreurs de synchronisation',
    'sync.dead_letter': 'File des échecs',
    'sync.all_clear': 'Tout est en ordre !',
    'sync.no_errors': 'Aucune erreur de synchronisation détectée',
    // PWA
    'pwa.storage_warning': 'Stockage non persistant : installez l’application depuis votre navigateur pour protéger les données hors ligne.',
};

export default misc;
