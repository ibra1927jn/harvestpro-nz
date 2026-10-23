import type { TranslationDict } from '../../types';

const legal: TranslationDict = {
    'error.title': 'Une erreur s’est produite',
    'error.description': 'L’application a rencontré une erreur inattendue.',
    'error.reload': 'Recharger l’application',
    'error.clearCache': 'Vider le cache et recharger',
    'privacy.title': 'Avis de confidentialité et de collecte des données',
    'privacy.subtitle': 'Conformément au Privacy Act 2020 de Nouvelle-Zélande, nous devons vous informer de la manière dont vos informations personnelles sont collectées, utilisées et protégées avant que vous utilisiez ce système. Veuillez lire attentivement ce qui suit.',
    'privacy.section1.title': '1. Informations collectées (IPP 1–3)',
    'privacy.section1.body': 'HarvestPro NZ collecte les informations personnelles suivantes :\n• Nom complet, adresse e-mail et coordonnées\n• Informations d’emploi : rôle, type de contrat, statut du visa, numéro IRD\n• Données de travail : nombre de seaux/bins, horodatage des scans, attribution des rangs\n• Registre de présence : heures d’arrivée et de départ, respect des pauses, heures travaillées\n• Identifiants de l’appareil pour la synchronisation hors ligne\n• Données de localisation lors de l’utilisation de la carte des zones du verger (facultatif)\n\nCes informations sont collectées directement auprès de vous et de votre employeur (l’exploitant du verger) aux fins décrites ci-dessous.',
    'privacy.section2.title': '2. Finalité de la collecte (IPP 1)',
    'privacy.section2.body': 'Vos informations personnelles sont collectées et utilisées pour :\n• Calculer avec précision les salaires, les tarifs à la pièce et les compléments au salaire minimum exigés par l’Employment Relations Act 2000\n• Contrôler le respect des pauses repos et repas prévues par la loi\n• Générer des rapports de paie à exporter vers des logiciels de paie autorisés (Xero, PaySauce)\n• Suivre la productivité de la récolte et les opérations du verger\n• Garantir le respect des règles de santé et de sécurité au travail\n• Produire les journaux d’audit exigés par la réglementation du travail néo-zélandaise',
    'privacy.section3.title': '3. Stockage et sécurité (IPP 5)',
    'privacy.section3.body': 'Vos données sont stockées :\n• Sur des serveurs cloud exploités par Supabase (PostgreSQL) avec sécurité au niveau des lignes (RLS) — vous n’accédez qu’aux données de votre verger\n• Dans le stockage local de l’appareil (IndexedDB chiffré en AES-256) pour le fonctionnement hors ligne\n• Toutes les transmissions de données sont chiffrées en TLS 1.3\n• L’accès est contrôlé par des autorisations selon le rôle et une authentification multifacteur pour les responsables\n• Les données financières et personnelles sont chiffrées au repos sur votre appareil',
    'privacy.section4.title': '4. Qui y a accès (IPP 11)',
    'privacy.section4.body': 'Vos informations personnelles peuvent être consultées par :\n• Le responsable de votre verger et l’administrateur de la paie\n• Les chefs d’équipe (limité aux données de présence et d’attribution de leur équipe)\n• L’exploitant du verger, pour ses obligations légales et réglementaires\n• Les administrations, uniquement lorsque la loi l’exige (p. ex. Employment NZ, IRD)\n\nVos données ne seront PAS vendues, partagées avec des annonceurs ni communiquées à un tiers non mentionné ci-dessus sans votre consentement explicite ou une obligation légale.',
    'privacy.section5.title': '5. Vos droits (IPP 6–7)',
    'privacy.section5.body': 'En vertu du Privacy Act 2020 de Nouvelle-Zélande, vous avez le droit de :\n• Demander l’accès à toutes les informations personnelles vous concernant\n• Demander la correction de toute information inexacte\n• Demander comment vos informations ont été utilisées ou communiquées\n• Refuser la collecte de données non essentielles (p. ex. la localisation)\n• Déposer une plainte auprès du Privacy Commissioner de Nouvelle-Zélande (privacy.org.nz)\n\nPour exercer ces droits, contactez le responsable de votre verger ou écrivez à l’administrateur du système.',
    'privacy.section6.title': '6. Conservation des données',
    'privacy.section6.body': 'Les dossiers d’emploi sont conservés au moins 6 ans, comme l’exigent l’Employment Relations Act 2000 et le Holidays Act 2003. Passé ce délai, ils peuvent être supprimés ou anonymisés de façon sécurisée.\n\nÀ la fin de votre contrat, votre compte est désactivé mais les dossiers sont conservés pendant la durée légale.',
    'privacy.legalRef': 'Cet avis est établi conformément au Privacy Act 2020 de Nouvelle-Zélande (Information Privacy Principles 1–6), à l’Employment Relations Act 2000 et au Holidays Act 2003. Pour toute question, contactez l’Office of the Privacy Commissioner de Nouvelle-Zélande sur privacy.org.nz.',
    'privacy.acceptButton': 'J’ai lu et j’accepte cet avis de confidentialité',
    'privacy.submitting': 'Enregistrement du consentement…',
    'privacy.scrollToRead': 'Faites défiler pour lire l’avis complet',
    'privacy.footer': 'Votre consentement sera enregistré avec la date et l’heure. Vous pouvez demander une copie de cet avis à tout moment.',
    'privacy.error': 'Impossible d’enregistrer le consentement. Réessayez ou contactez votre responsable.',
};

export default legal;
