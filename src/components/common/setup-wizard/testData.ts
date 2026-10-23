/**
 * Datos de ejemplo para los tests del asistente de huerto nuevo
 */
import type { WizardData } from './wizard.types';

export const sampleWizardData: WizardData = {
    orchard: { code: 'JP-01', name: 'J&P Cherries', location: 'Cromwell' },
    season: { name: 'Season 2026–27', start_date: '2026-10-24', end_date: '' },
    blocks: [
        { name: 'Block A', row_from: 1, row_to: 15, variety: 'Royal Gala', target_buckets: 90 },
        { name: 'Block B', row_from: 16, row_to: 20, variety: '', target_buckets: 100 },
    ],
    rates: { variety: 'Lapin', piece_rate: 1.85, start_time: '06:30' },
};
