import { describe, it, expect } from 'vitest';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';

const ORCHARD_MAP_KEYS = [
    'orchardMap.command_center',
    'orchardMap.active',
    'orchardMap.buckets',
    'orchardMap.blocks',
    'orchardMap.rows',
    'orchardMap.live',
    'orchardMap.variety_filter',
    'orchardMap.all',
    'orchardMap.status.empty',
    'orchardMap.status.idle',
    'orchardMap.status.in_progress',
    'orchardMap.status.complete',
    'orchardMap.status.alert',
    'orchardMap.row.completed',
    'orchardMap.row.active_pickers',
    'orchardMap.row.tap_to_assign',
    'orchardMap.block.rows',
    'orchardMap.block.pickers',
    'orchardMap.block.buckets',
    'orchardMap.block.progress',
    'orchardMap.block.view_rows',
    // Vista Lista (Row List View)
    'orchardMap.list.live_control',
    'orchardMap.list.pickers_online',
    'orchardMap.list.row_count',
    'orchardMap.list.total_yield',
    'orchardMap.list.buckets',
    'orchardMap.list.col.id',
    'orchardMap.list.col.status',
    'orchardMap.list.col.harvest_progress',
    'orchardMap.list.col.units',
    'orchardMap.list.col.eta',
    'orchardMap.list.status.active',
    'orchardMap.list.status.idle',
];

describe('OrchardMap i18n — all keys present', () => {
    ORCHARD_MAP_KEYS.forEach(key => {
        it(`EN has key: ${key}`, () => { expect(en[key]).toBeDefined(); });
    });
    ORCHARD_MAP_KEYS.forEach(key => {
        it(`ES has key: ${key}`, () => { expect(es[key]).toBeDefined(); });
    });
});
