import type { TranslationDict } from '../../types';

const insights: TranslationDict = {
    'insights.header': 'Analyses et rapports',
    'insights.subtitle': 'Analyse des coûts et rapports de performance · {orchard}',
    'insights.pickers_badge': '{n} cueilleurs',
    'insights.live_data': 'Données en direct',
    // Tabs
    'insights.tabs.analytics': 'Analyses',
    'insights.tabs.report': 'Rapport hebdomadaire',
    'insights.tabs.fraud': 'Bouclier anti-fraude',
    // KPI cards
    'insights.kpi.cost_per_bin': 'COÛT/BIN',
    'insights.kpi.total_bins': 'TOTAL DES BINS',
    'insights.kpi.total_labour': 'MAIN-D’ŒUVRE TOTALE',
    'insights.kpi.min_wage_topup': 'COMPLÉMENT SALAIRE MIN.',
    // Cost breakdown
    'insights.cost_breakdown.title': 'Répartition des coûts',
    'insights.cost_breakdown.subtitle': 'Tarif à la pièce vs complément au salaire minimum',
    'insights.cost_breakdown.empty': 'En attente des données de scan',
    'insights.piece_rate.title': 'Gains au tarif à la pièce',
    'insights.piece_rate.subtitle': 'Rémunération au rendement',
    'insights.min_wage.title': 'Complément au salaire minimum',
    'insights.min_wage.subtitle': 'Coût de la conformité légale',
    // 7-day trend
    'insights.trend.title': 'Coût par bin — tendance sur 7 jours',
    'insights.trend.subtitle': 'Points rouges = au-dessus du seuil de rentabilité',
    'insights.trend.breakeven': 'Seuil de rentabilité',
    // Team cost
    'insights.team_cost.title': 'Coût par équipe',
    'insights.team_cost.subtitle': 'Coût/bin plus bas = plus efficace',
    'insights.team_cost.empty': 'Pas encore de données d’équipe',
    'insights.team_cost.empty_desc': 'Les données apparaissent quand les cueilleurs envoient des scans',
    // Efficiency
    'insights.efficient.most.title': 'Les plus efficaces',
    'insights.efficient.most.subtitle': 'Coût par bin le plus bas (NZD)',
    'insights.efficient.most.empty': 'En attente des données de récolte',
    'insights.efficient.least.title': 'Les moins efficaces',
    'insights.efficient.least.subtitle': 'Coût par bin le plus élevé (NZD)',
    'insights.efficient.least.empty': 'En attente des données de récolte',
    'insights.bins': 'bins',
    'insights.per_bin': '/bin',
    // Weekly Report
    'insights.weekly.title': 'Rapport hebdomadaire',
    'insights.weekly.export': 'Exporter le rapport',
    'insights.weekly.team_rankings': 'Classement des équipes',
    'insights.weekly.top10': 'Top 10 des cueilleurs',
    'insights.weekly.no_teams': 'Aucune donnée d’équipe',
    'insights.weekly.no_pickers': 'Pas encore de cueilleurs',
    // Weekly report KPI cards
    'insights.weekly.total_bins': 'TOTAL DES BINS',
    'insights.weekly.total_hours': 'TOTAL DES HEURES',
    'insights.weekly.total_labour': 'MAIN-D’ŒUVRE TOTALE',
    'insights.weekly.avg_bins_hr': 'MOY. BINS/H',
    'insights.weekly.cost_per_bin': 'COÛT/BIN',
    // Weekly report charts
    'insights.weekly.velocity_title': 'Cadence de récolte',
    'insights.weekly.velocity_subtitle': 'Bins produits par jour — tendance sur 7 jours',
    'insights.weekly.workforce_title': 'Effectif',
    'insights.weekly.workforce_subtitle': 'Cueilleurs actifs par jour',
    'insights.weekly.daily_target': 'Objectif journalier',
    // Suffixes and counts
    'insights.weekly.pickers_suffix': 'cueilleurs',
    'insights.weekly.bins_suffix': 'bins',
    'insights.weekly.bins_hr_suffix': 'bins/h',
    'insights.weekly.pickers_count': '{n} cueilleurs',
    'insights.weekly.bins_count': '{n} bins',
};

export default insights;
