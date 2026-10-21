import type { TranslationDict } from '../../types';

const logistics: TranslationDict = {
  // Health banner
  'logistics.health.headline.green': 'Logistics keeping up with harvest',
  'logistics.health.headline.amber': 'Logistics slightly behind — monitor closely',
  'logistics.health.headline.red': 'Logistics falling behind — escalate now',
  'logistics.health.status.green': 'On Track',
  'logistics.health.status.amber': 'Behind',
  'logistics.health.status.red': 'Critical',
  // Backlog chart
  'logistics.backlog.title': 'Bin Backlog',
  'logistics.backlog.subtitle': 'Bins waiting for pickup by hour',
  'logistics.backlog.y_axis': 'Pending bins',
  'logistics.backlog.empty': 'No backlog data yet',
  // SLA card
  'logistics.sla.title': 'Avg Pickup Time',
  'logistics.sla.vs_week': 'vs 7-day avg',
  'logistics.sla.no_data': 'No pickups yet',
  'logistics.sla.cycle': 'Avg Cycle',
  // Leaderboard
  'logistics.leaderboard.title': 'Runner Leaderboard',
  'logistics.leaderboard.col.runner': 'Runner',
  'logistics.leaderboard.col.cycles': 'Cycles',
  'logistics.leaderboard.col.avg_cycle': 'Avg Cycle',
  'logistics.leaderboard.empty': 'No runner data yet',
  // Events feed
  'logistics.events.title': 'Recent Events',
  'logistics.events.pickup_requested': 'Pickup requested',
  'logistics.events.row_blocked': 'Row blocked',
  'logistics.events.alert': 'Alert from runner senior',
  'logistics.events.empty': 'No recent events',
  'logistics.operations': 'Operations',
};

export default logistics;
