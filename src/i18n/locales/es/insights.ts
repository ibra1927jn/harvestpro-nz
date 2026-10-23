import type { TranslationDict } from '../../types';

const insights: TranslationDict = {
    'insights.header': 'Análisis e Informes',
    'insights.subtitle': 'Análisis de costos e informes de rendimiento · {orchard}',
    'insights.pickers_badge': '{n} recolectores',
    'insights.live_data': 'Datos en vivo',
    // Tabs
    'insights.tabs.analytics': 'Análisis',
    'insights.tabs.report': 'Informe Semanal',
    'insights.tabs.fraud': 'Escudo Anti-Fraude',
    // KPI
    'insights.kpi.cost_per_bin': 'COSTO/CUBETA',
    'insights.kpi.total_bins': 'CUBETAS TOTALES',
    'insights.kpi.total_labour': 'MANO DE OBRA TOTAL',
    'insights.kpi.min_wage_topup': 'COMPLEMENTO SALARIO MÍN.',
    // Cost breakdown
    'insights.cost_breakdown.title': 'Desglose de Costos',
    'insights.cost_breakdown.subtitle': 'Tarifa por pieza vs complemento de salario mínimo',
    'insights.cost_breakdown.empty': 'Esperando datos de escaneo',
    'insights.piece_rate.title': 'Ganancias por Tarifa',
    'insights.piece_rate.subtitle': 'Pago basado en rendimiento',
    'insights.min_wage.title': 'Complemento Salario Mínimo',
    'insights.min_wage.subtitle': 'Costo de cumplimiento legal',
    // Trend
    'insights.trend.title': 'Costo por Cubeta — Tendencia 7 Días',
    'insights.trend.subtitle': 'Puntos rojos = por encima del umbral de equilibrio',
    'insights.trend.breakeven': 'Equilibrio',
    // Team cost
    'insights.team_cost.title': 'Costo por Equipo',
    'insights.team_cost.subtitle': 'Menor costo/cubeta = más eficiente',
    'insights.team_cost.empty': 'Aún sin datos de equipo',
    'insights.team_cost.empty_desc': 'Los datos aparecen cuando los recolectores envían escaneos',
    // Efficiency
    'insights.efficient.most.title': 'Más Eficiente',
    'insights.efficient.most.subtitle': 'Menor costo por cubeta (NZD)',
    'insights.efficient.most.empty': 'Esperando datos de cosecha',
    'insights.efficient.least.title': 'Menos Eficiente',
    'insights.efficient.least.subtitle': 'Mayor costo por cubeta (NZD)',
    'insights.efficient.least.empty': 'Esperando datos de cosecha',
    'insights.bins': 'cubetas',
    'insights.per_bin': '/cubeta',
    // Weekly Report
    'insights.weekly.title': 'Informe Semanal',
    'insights.weekly.export': 'Exportar Informe',
    'insights.weekly.team_rankings': 'Clasificación de Equipos',
    'insights.weekly.top10': 'Top 10 Recolectores',
    'insights.weekly.no_teams': 'Sin datos de equipo',
    'insights.weekly.no_pickers': 'Sin recolectores aún',
    // Tarjetas KPI del informe semanal
    'insights.weekly.total_bins': 'CUBETAS TOTALES',
    'insights.weekly.total_hours': 'HORAS TOTALES',
    'insights.weekly.total_labour': 'MANO DE OBRA TOTAL',
    'insights.weekly.avg_bins_hr': 'PROM CUBETAS/HR',
    'insights.weekly.cost_per_bin': 'COSTO/CUBETA',
    // Gráficos del informe semanal
    'insights.weekly.velocity_title': 'Velocidad de Cosecha',
    'insights.weekly.velocity_subtitle': 'Cubetas diarias producidas — tendencia 7 días',
    'insights.weekly.workforce_title': 'Tamaño del Equipo',
    'insights.weekly.workforce_subtitle': 'Recolectores activos por día',
    'insights.weekly.daily_target': 'Meta Diaria',
    // Sufijos y conteos
    'insights.weekly.pickers_suffix': 'recolectores',
    'insights.weekly.bins_suffix': 'cubetas',
    'insights.weekly.bins_hr_suffix': 'cubetas/hr',
    'insights.weekly.pickers_count': '{n} recolectores',
    'insights.weekly.bins_count': '{n} cubetas',
};

export default insights;
