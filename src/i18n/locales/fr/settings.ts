import type { TranslationDict } from '../../types';

const settings: TranslationDict = {
    'settings.title': 'Paramètres',
    'settings.header': 'Paramètres',
    'settings.subtitle': 'Configuration de {orchard}',
    'settings.language': 'Langue',
    'settings.language_desc': 'Choisissez votre langue',
    'settings.language.active': 'Active',
    'settings.notifications': 'Notifications',
    'settings.security': 'Sécurité',
    // Banner
    'settings.banner.role': 'Responsable',
    'settings.banner.orchard_line': '{role} · {orchard}',
    'settings.banner.rows': 'RANGS',
    'settings.banner.rate': 'TARIF',
    'settings.banner.target': 'OBJECTIF',
    // Harvest Configuration
    'settings.harvest.title': 'Configuration de la récolte',
    'settings.harvest.subtitle': 'Tarifs, objectifs et horaires de poste',
    'settings.harvest.min_wage': 'Salaire minimum (par heure)',
    'settings.harvest.target_buckets': 'Objectif de seaux / heure',
    'settings.harvest.daily_target': 'Objectif journalier (tonnes)',
    'settings.harvest.shift_hours': 'HORAIRES DE POSTE',
    'settings.harvest.shift_start': 'Début du poste',
    'settings.harvest.min_warning': 'Minimum pour atteindre ${wage}/h à ${rate}/seau = {floor} seaux/h',
    // Orchard Details
    'settings.orchard.title': 'Détails du verger',
    'settings.orchard.subtitle': 'Informations sur l’exploitation',
    'settings.orchard.label': 'Verger',
    'settings.orchard.total_rows': 'Nombre total de rangs',
    'settings.orchard.varieties': 'Variétés de fruits',
    // Compliance
    'settings.compliance.title': 'Paramètres de conformité',
    'settings.compliance.subtitle': 'Réglementation du travail NZ',
    'settings.compliance.audit_trail': 'Journal d’audit',
    'settings.compliance.audit_trail_desc': 'Toutes les actions sont enregistrées — impossible à désactiver',
    'settings.compliance.always_on': 'Toujours actif',
    // Danger Zone
    'settings.danger.title': 'Zone de danger',
    'settings.danger.subtitle': 'Actions irréversibles',
    'settings.danger.day_closure': 'Clôture de la journée',
    'settings.danger.day_closure_desc': 'Finaliser la paie, verrouiller les enregistrements et clôturer la journée de récolte',
    // Misc
    'settings.saved_banner': 'Toutes les modifications sont enregistrées',
    'settings.locked_by_hr': 'Seuls les RH peuvent modifier cette valeur',
    'settings.harvest.shift_end_by_person': 'Il n’y a pas d’heure de fin de poste : chaque équipe et chaque runner termine en pointant son départ.',
};

export default settings;
