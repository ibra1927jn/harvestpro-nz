import type { TranslationDict } from '../../types';

const orchardMap: TranslationDict = {
    'orchardMap.command_center': 'Command Center',
    'orchardMap.active': 'active',
    'orchardMap.buckets': 'buckets',
    'orchardMap.blocks': 'blocks',
    'orchardMap.rows': 'rows',
    'orchardMap.live': 'LIVE',
    'orchardMap.varieties': 'varieties',
    'orchardMap.variety_filter': 'Variety',
    'orchardMap.all': 'All',
    'orchardMap.status.empty': 'Empty',
    'orchardMap.status.idle': 'Unassigned',
    'orchardMap.status.in_progress': 'In Progress',
    'orchardMap.status.complete': 'Complete',
    'orchardMap.status.alert': 'Alert',
    'orchardMap.row.completed': 'completed',
    'orchardMap.row.active_pickers': 'active pickers',
    'orchardMap.row.tap_to_assign': 'Tap to assign',
    // Block card stats
    'orchardMap.block.rows': 'ROWS',
    'orchardMap.block.pickers': 'PICKERS',
    'orchardMap.block.buckets': 'BUCKETS',
    'orchardMap.block.progress': 'Progress',
    'orchardMap.block.view_rows': 'View Rows',
    'orchardMap.block.rows_of': '{completed}/{total} rows',
    // Row level
    'orchardMap.row.rows': 'Rows',
    'orchardMap.row.no_team': 'No team assigned to Row {n}',
    'orchardMap.row.people': 'people',
    'orchardMap.row.role.picker': 'Picker',
    'orchardMap.row.role.runner': 'Bucket Runner',
    // Varieties count (pluralization)
    'orchardMap.one_variety': '{n} variety',
    'orchardMap.n_varieties': '{n} varieties',
    // Row List View (Vista Lista terminal)
    'orchardMap.list.live_control': 'Live Control',
    'orchardMap.list.pickers_online': 'Pickers Online',
    'orchardMap.list.row_count': 'Row Count',
    'orchardMap.list.total_yield': 'Total Yield',
    'orchardMap.list.buckets': 'BUCKETS',
    'orchardMap.list.col.id': 'ID',
    'orchardMap.list.col.status': 'Status',
    'orchardMap.list.col.harvest_progress': 'Harvest Progress',
    'orchardMap.list.col.units': 'Units',
    'orchardMap.list.col.eta': 'ETA',
    'orchardMap.list.status.active': 'Active',
    'orchardMap.list.status.idle': 'Idle',
    // Block card title with letter and variety
    'orchardMap.blockTitle': 'Block {letter} — {variety}',
    // Vista del team leader: equipo de cada fila (OrchardMapView / RowCard)
    'orchardMap.team.mine': 'My team',
    'orchardMap.team.other': 'Team of {name}',
    'orchardMap.team.other_unknown': 'Another team',
    'orchardMap.team.legend_mine': 'My team\'s rows',
    'orchardMap.team.legend_other': 'Other teams',
};

export default orchardMap;
