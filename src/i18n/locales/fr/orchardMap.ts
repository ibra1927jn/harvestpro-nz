import type { TranslationDict } from '../../types';

const orchardMap: TranslationDict = {
    'orchardMap.command_center': 'Centre de pilotage',
    'orchardMap.active': 'actifs',
    'orchardMap.buckets': 'seaux',
    'orchardMap.blocks': 'blocs',
    'orchardMap.rows': 'rangs',
    'orchardMap.live': 'EN DIRECT',
    'orchardMap.variety_filter': 'Variété',
    'orchardMap.all': 'Toutes',
    'orchardMap.status.empty': 'Vide',
    'orchardMap.status.idle': 'Non attribué',
    'orchardMap.status.in_progress': 'En cours',
    'orchardMap.status.complete': 'Terminé',
    'orchardMap.status.alert': 'Alerte',
    'orchardMap.row.completed': 'terminés',
    'orchardMap.row.active_pickers': 'cueilleurs actifs',
    'orchardMap.row.tap_to_assign': 'Touchez pour attribuer',
    // Block card stats
    'orchardMap.block.rows': 'RANGS',
    'orchardMap.block.pickers': 'CUEILLEURS',
    'orchardMap.block.buckets': 'SEAUX',
    'orchardMap.block.progress': 'Avancement',
    'orchardMap.block.view_rows': 'Voir les rangs',
    'orchardMap.block.rows_of': '{completed}/{total} rangs',
    // Row level
    'orchardMap.row.rows': 'Rangs',
    'orchardMap.row.no_team': 'Aucune équipe attribuée au rang {n}',
    'orchardMap.row.people': 'personnes',
    'orchardMap.row.role.picker': 'Cueilleur',
    'orchardMap.row.role.runner': 'Runner de seaux',
    // Varieties count (pluralization)
    'orchardMap.one_variety': '{n} variété',
    'orchardMap.n_varieties': '{n} variétés',
    // Row List View (Vista Lista terminal)
    'orchardMap.list.live_control': 'Suivi en direct',
    'orchardMap.list.pickers_online': 'Cueilleurs en ligne',
    'orchardMap.list.row_count': 'Nombre de rangs',
    'orchardMap.list.total_yield': 'Rendement total',
    'orchardMap.list.buckets': 'SEAUX',
    'orchardMap.list.col.id': 'ID',
    'orchardMap.list.col.status': 'État',
    'orchardMap.list.col.harvest_progress': 'Avancement de la récolte',
    'orchardMap.list.col.units': 'Unités',
    'orchardMap.list.col.eta': 'Fin estimée',
    'orchardMap.list.status.active': 'Actif',
    'orchardMap.list.status.idle': 'Inactif',
    // Block card title with letter and variety
    'orchardMap.blockTitle': 'Bloc {letter} — {variety}',
    // Vista del team leader: equipo de cada fila (OrchardMapView / RowCard)
    'orchardMap.team.mine': 'Mon équipe',
    'orchardMap.team.other': 'Équipe de {name}',
    'orchardMap.team.other_unknown': 'Autre équipe',
    'orchardMap.team.legend_mine': 'Rangs de mon équipe',
    'orchardMap.team.legend_other': 'Autres équipes',
};

export default orchardMap;
