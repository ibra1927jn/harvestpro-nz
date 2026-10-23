import type { TranslationDict } from '../../types';

const settings: TranslationDict = {
    'settings.title': 'Paramètres',
    'settings.header': 'Paramètres',
    'settings.subtitle': 'Configuration de {orchard}',
    'settings.language': 'Langue',
    'settings.language_desc': 'Choisissez votre langue',
    'settings.language.active': 'Active',
    'settings.notifications': 'Notifications',
    'settings.profile': 'Profil',
    'settings.security': 'Sécurité',
    'settings.about': 'À propos',
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
    'settings.compliance.nz_standards': 'Normes d’emploi NZ',
    'settings.compliance.nz_standards_desc': 'Faire respecter le salaire minimum et les pauses obligatoires',
    'settings.compliance.wage_alerts': 'Alertes salariales automatiques',
    'settings.compliance.wage_alerts_desc': 'Prévenir quand des travailleurs passent sous le salaire minimum',
    'settings.compliance.safety': 'Vérification de sécurité obligatoire',
    'settings.compliance.safety_desc': 'Exiger une vérification de sécurité quotidienne avant de scanner',
    'settings.compliance.audit_trail': 'Journal d’audit',
    'settings.compliance.audit_trail_desc': 'Toutes les actions sont enregistrées — impossible à désactiver',
    'settings.compliance.always_on': 'Toujours actif',
    // Danger Zone
    'settings.danger.title': 'Zone de danger',
    'settings.danger.subtitle': 'Actions irréversibles',
    'settings.danger.day_closure': 'Clôture de la journée',
    'settings.danger.day_closure_desc': 'Finaliser la paie, verrouiller les enregistrements et clôturer la journée de récolte',
    'settings.danger.end_day': 'Clôturer et verrouiller la journée',
    'settings.danger.reset_title': 'Réinitialiser les données du jour',
    'settings.danger.reset_desc': 'Effacer tous les enregistrements de seaux du jour',
    'settings.danger.reset_btn': 'Réinitialiser',
    // Misc
    'settings.saved_banner': 'Toutes les modifications sont enregistrées',
    'settings.footer': 'HarvestPro NZ · v9.9.0 · © 2026 HarvestPro. Conçu pour les vergers de Nouvelle-Zélande.',
    'settings.locked_by_hr': 'Seuls les RH peuvent modifier cette valeur',
    'settings.harvest.shift_end_by_person': 'Il n’y a pas d’heure de fin de poste : chaque équipe et chaque runner termine en pointant son départ.',
};

export default settings;
