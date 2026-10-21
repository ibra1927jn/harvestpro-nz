import type { TranslationDict } from '../../types';

const orchardMap: TranslationDict = {
    'orchardMap.command_center': 'Centro de Mando',
    'orchardMap.active': 'activos',
    'orchardMap.buckets': 'cubetas',
    'orchardMap.blocks': 'bloques',
    'orchardMap.rows': 'filas',
    'orchardMap.live': 'EN VIVO',
    'orchardMap.varieties': 'variedades',
    'orchardMap.variety_filter': 'Variedad',
    'orchardMap.all': 'Todas',
    'orchardMap.status.empty': 'Vacía',
    'orchardMap.status.idle': 'Sin asignar',
    'orchardMap.status.in_progress': 'En Progreso',
    'orchardMap.status.complete': 'Completa',
    'orchardMap.status.alert': 'Alerta',
    'orchardMap.row.completed': 'completadas',
    'orchardMap.row.active_pickers': 'recolectores activos',
    'orchardMap.row.tap_to_assign': 'Toca para asignar',
    // Tarjeta de bloque
    'orchardMap.block.rows': 'FILAS',
    'orchardMap.block.pickers': 'RECOLECTORES',
    'orchardMap.block.buckets': 'CUBETAS',
    'orchardMap.block.progress': 'Progreso',
    'orchardMap.block.view_rows': 'Ver Filas',
    'orchardMap.block.rows_of': '{completed}/{total} filas',
    // Nivel de fila
    'orchardMap.row.rows': 'Filas',
    'orchardMap.row.no_team': 'Sin equipo asignado a Fila {n}',
    'orchardMap.row.people': 'personas',
    'orchardMap.row.role.picker': 'Recolector',
    'orchardMap.row.role.runner': 'Corredor',
    // Conteo de variedades (pluralización)
    'orchardMap.one_variety': '{n} variedad',
    'orchardMap.n_varieties': '{n} variedades',
    // Vista Lista (terminal)
    'orchardMap.list.live_control': 'Control en Vivo',
    'orchardMap.list.pickers_online': 'Recolectores en Línea',
    'orchardMap.list.row_count': 'Conteo de Filas',
    'orchardMap.list.total_yield': 'Producción Total',
    'orchardMap.list.buckets': 'CUBETAS',
    'orchardMap.list.col.id': 'ID',
    'orchardMap.list.col.status': 'Estado',
    'orchardMap.list.col.harvest_progress': 'Progreso de Cosecha',
    'orchardMap.list.col.units': 'Unidades',
    'orchardMap.list.col.eta': 'ETA',
    'orchardMap.list.status.active': 'Activo',
    'orchardMap.list.status.idle': 'Inactivo',
    // Título de tarjeta de bloque con letra y variedad
    'orchardMap.blockTitle': 'Bloque {letter} — {variety}',
    // Vista del team leader: equipo de cada fila (OrchardMapView / RowCard)
    'orchardMap.team.mine': 'Mi equipo',
    'orchardMap.team.other': 'Equipo de {name}',
    'orchardMap.team.other_unknown': 'Otro equipo',
    'orchardMap.team.legend_mine': 'Filas de mi equipo',
    'orchardMap.team.legend_other': 'Otros equipos',
};

export default orchardMap;
