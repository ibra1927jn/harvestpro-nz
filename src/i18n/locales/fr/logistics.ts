import type { TranslationDict } from '../../types';

const logistics: TranslationDict = {
  // Health banner
  'logistics.health.headline.green': 'La logistique suit le rythme de la récolte',
  'logistics.health.headline.amber': 'La logistique prend un peu de retard — à surveiller',
  'logistics.health.headline.red': 'La logistique est en retard — à faire remonter maintenant',
  'logistics.health.status.green': 'Dans les temps',
  'logistics.health.status.amber': 'En retard',
  'logistics.health.status.red': 'Critique',
  // Backlog chart
  'logistics.backlog.title': 'Bins en attente',
  'logistics.backlog.subtitle': 'Bins en attente de ramassage, par heure',
  'logistics.backlog.y_axis': 'Bins en attente',
  'logistics.backlog.empty': 'Pas encore de données d’attente',
  // SLA card
  'logistics.sla.title': 'Délai moyen de ramassage',
  'logistics.sla.vs_week': 'vs moyenne sur 7 jours',
  'logistics.sla.no_data': 'Aucun ramassage pour l’instant',
  'logistics.sla.cycle': 'Cycle moyen',
  // Leaderboard
  'logistics.leaderboard.title': 'Classement des runners',
  'logistics.leaderboard.col.runner': 'Runner',
  'logistics.leaderboard.col.cycles': 'Cycles',
  'logistics.leaderboard.col.avg_cycle': 'Cycle moyen',
  'logistics.leaderboard.empty': 'Pas encore de données de runner',
  // Events feed
  'logistics.events.title': 'Événements récents',
  'logistics.events.pickup_requested': 'Ramassage demandé',
  'logistics.events.row_blocked': 'Rang bloqué',
  'logistics.events.alert': 'Alerte du runner principal',
  'logistics.events.empty': 'Aucun événement récent',
  'logistics.operations': 'Opérations',
};

export default logistics;
