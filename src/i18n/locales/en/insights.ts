import type { TranslationDict } from '../../types';

const insights: TranslationDict = {
    'insights.header': 'Insights & Analytics',
    'insights.subtitle': 'Cost analysis & performance reports · {orchard}',
    'insights.pickers_badge': '{n} pickers',
    'insights.live_data': 'Live data',
    // Tabs
    'insights.tabs.analytics': 'Analytics',
    'insights.tabs.report': 'Weekly Report',
    'insights.tabs.fraud': 'Fraud Shield',
    // KPI cards
    'insights.kpi.cost_per_bin': 'COST/BIN',
    'insights.kpi.total_bins': 'TOTAL BINS',
    'insights.kpi.total_labour': 'TOTAL LABOUR',
    'insights.kpi.min_wage_topup': 'MIN WAGE TOP-UP',
    // Cost breakdown
    'insights.cost_breakdown.title': 'Cost Breakdown',
    'insights.cost_breakdown.subtitle': 'Piece rate vs minimum wage top-up',
    'insights.cost_breakdown.empty': 'Awaiting scan data',
    'insights.piece_rate.title': 'Piece Rate Earnings',
    'insights.piece_rate.subtitle': 'Performance-based pay',
    'insights.min_wage.title': 'Minimum Wage Top-Up',
    'insights.min_wage.subtitle': 'Legal compliance cost',
    // 7-day trend
    'insights.trend.title': 'Cost Per Bin — 7 Day Trend',
    'insights.trend.subtitle': 'Red dots = above break-even threshold',
    'insights.trend.breakeven': 'Break-even',
    // Team cost
    'insights.team_cost.title': 'Cost Per Team',
    'insights.team_cost.subtitle': 'Lower cost/bin = more efficient',
    'insights.team_cost.empty': 'No team data yet',
    'insights.team_cost.empty_desc': 'Data appears as pickers submit scans',
    // Efficiency
    'insights.efficient.most.title': 'Most Efficient',
    'insights.efficient.most.subtitle': 'Lowest cost per bin (NZD)',
    'insights.efficient.most.empty': 'Awaiting harvest data',
    'insights.efficient.least.title': 'Least Efficient',
    'insights.efficient.least.subtitle': 'Highest cost per bin (NZD)',
    'insights.efficient.least.empty': 'Awaiting harvest data',
    'insights.bins': 'bins',
    'insights.per_bin': '/bin',
    // Weekly Report
    'insights.weekly.title': 'Weekly Report',
    'insights.weekly.export': 'Export Report',
    'insights.weekly.team_rankings': 'Team Rankings',
    'insights.weekly.top10': 'Top 10 Pickers',
    'insights.weekly.no_teams': 'No team data',
    'insights.weekly.no_pickers': 'No pickers yet',
    // Weekly report KPI cards
    'insights.weekly.total_bins': 'TOTAL BINS',
    'insights.weekly.total_hours': 'TOTAL HOURS',
    'insights.weekly.total_labour': 'TOTAL LABOUR',
    'insights.weekly.avg_bins_hr': 'AVG BINS/HR',
    'insights.weekly.cost_per_bin': 'COST/BIN',
    // Weekly report charts
    'insights.weekly.velocity_title': 'Harvest Velocity',
    'insights.weekly.velocity_subtitle': 'Daily bins produced — 7 day trend',
    'insights.weekly.workforce_title': 'Workforce Size',
    'insights.weekly.workforce_subtitle': 'Active pickers per day',
    'insights.weekly.daily_target': 'Daily Target',
    // Suffixes and counts
    'insights.weekly.pickers_suffix': 'pickers',
    'insights.weekly.bins_suffix': 'bins',
    'insights.weekly.bins_hr_suffix': 'bins/hr',
    'insights.weekly.pickers_count': '{n} pickers',
    'insights.weekly.bins_count': '{n} bins',
};

export default insights;
