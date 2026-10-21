import type { TranslationDict } from '../../types';

const logistics: TranslationDict = {
  // Banner de salud
  'logistics.health.headline.green': 'Logística al día con la cosecha',
  'logistics.health.headline.amber': 'Logística ligeramente atrasada — monitorear de cerca',
  'logistics.health.headline.red': 'Logística retrasada — escalar ahora',
  'logistics.health.status.green': 'Al Día',
  'logistics.health.status.amber': 'Atrasado',
  'logistics.health.status.red': 'Crítico',
  // Gráfico de pendiente de cubetas
  'logistics.backlog.title': 'Pendiente de Cubetas',
  'logistics.backlog.subtitle': 'Cubetas esperando recogida por hora',
  'logistics.backlog.y_axis': 'Cubetas pendientes',
  'logistics.backlog.empty': 'Sin datos de pendiente aún',
  // Tarjeta SLA
  'logistics.sla.title': 'Tiempo Promedio de Recogida',
  'logistics.sla.vs_week': 'vs promedio 7 días',
  'logistics.sla.no_data': 'Sin recogidas aún',
  'logistics.sla.cycle': 'Ciclo Promedio',
  // Tabla de clasificación
  'logistics.leaderboard.title': 'Clasificación de Corredores',
  'logistics.leaderboard.col.runner': 'Corredor',
  'logistics.leaderboard.col.cycles': 'Ciclos',
  'logistics.leaderboard.col.avg_cycle': 'Ciclo Promedio',
  'logistics.leaderboard.empty': 'Sin datos de corredor aún',
  // Feed de eventos
  'logistics.events.title': 'Eventos Recientes',
  'logistics.events.pickup_requested': 'Recogida solicitada',
  'logistics.events.row_blocked': 'Corredor bloqueado',
  'logistics.events.alert': 'Alerta del corredor senior',
  'logistics.events.empty': 'Sin eventos recientes',
  'logistics.operations': 'Operaciones',
};

export default logistics;
