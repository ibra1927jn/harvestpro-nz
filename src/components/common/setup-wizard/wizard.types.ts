/**
 * wizard.types.ts — Tipos, constantes y validación del asistente de huerto nuevo
 */

import type { OrchardSetupData, SetupBlock } from '@/services/setup.service';

/** Datos del asistente = lo que recibe setup.service (una sola definición) */
export type WizardData = OrchardSetupData;

export interface StepProps {
    data: WizardData;
}

export interface OrchardStepProps extends StepProps {
    onUpdate: (field: keyof WizardData['orchard'], value: string) => void;
}

export interface StructureStepProps extends StepProps {
    onSeason: (field: keyof WizardData['season'], value: string) => void;
    onBlocks: (blocks: SetupBlock[]) => void;
}

export interface RatesStepProps extends StepProps {
    onUpdate: (field: keyof WizardData['rates'], value: string | number) => void;
}

export interface SummaryStepProps extends StepProps {
    error: string | null;
}

/** Etiquetas: claves de i18n */
export const STEPS = [
    { key: 'orchard', label: 'owiz.step.orchard', icon: 'park' },
    { key: 'structure', label: 'owiz.step.structure', icon: 'grid_view' },
    { key: 'rates', label: 'owiz.step.rates', icon: 'payments' },
    { key: 'summary', label: 'owiz.step.summary', icon: 'check_circle' },
] as const;

/** Variedades sugeridas (se puede escribir cualquiera) */
export const VARIETIES = ['Lapin', 'Sweetheart', 'Kordia', 'Stella', 'Rainier', 'Skeena', 'Bing', 'Brooks', 'Staccato', 'Sam', 'White Gold', 'Earlise'];

/** Límites de la base (CHECK de harvest_seasons.name y orchard_blocks.name) */
export const SEASON_NAME_MAX = 80;
export const BLOCK_NAME_MAX = 60;

/** Letra del bloque n.º index: A, B, C… */
export function blockLetter(index: number): string {
    return String.fromCharCode(65 + (index % 26));
}

export function newBlock(name: string, rowFrom: number): SetupBlock {
    return {
        name,
        row_from: rowFrom,
        row_to: rowFrom + 9,
        variety: '',
        target_buckets: 100,
    };
}

export function initialWizardData(today: string, seasonName: string, firstBlockName: string): WizardData {
    return {
        orchard: { code: '', name: '', location: '' },
        season: { name: seasonName, start_date: today, end_date: '' },
        blocks: [newBlock(firstBlockName, 1)],
        rates: { variety: 'Lapin', piece_rate: 1.80, start_time: '06:30' },
    };
}

/**
 * Comprueba temporada y bloques; devuelve la clave del error o null.
 * Los números de fila no se repiten entre bloques (la base también lo impide).
 */
export function validateStructure(data: Pick<WizardData, 'season' | 'blocks'>): string | null {
    if (!data.season.name.trim() || !data.season.start_date) return 'owiz.err.season';
    if (data.season.name.trim().length > SEASON_NAME_MAX) return 'owiz.err.season_long';
    if (data.season.end_date && data.season.end_date < data.season.start_date) return 'owiz.err.dates';
    if (data.blocks.length === 0) return 'owiz.err.no_blocks';
    const names = new Set<string>();
    const ranges: Array<[number, number]> = [];
    for (const b of data.blocks) {
        const name = b.name.trim().toLowerCase();
        if (!name) return 'owiz.err.block_name';
        if (name.length > BLOCK_NAME_MAX) return 'owiz.err.block_name_long';
        if (names.has(name)) return 'owiz.err.block_dup';
        names.add(name);
        if (!Number.isInteger(b.row_from) || !Number.isInteger(b.row_to) || b.row_from < 1 || b.row_to < b.row_from
            || b.row_to > 9999 || b.row_to - b.row_from >= 1000) return 'owiz.err.range';
        if (!Number.isInteger(b.target_buckets) || b.target_buckets < 0 || b.target_buckets > 10000) return 'owiz.err.target';
        for (const [f, t] of ranges) if (b.row_from <= t && f <= b.row_to) return 'owiz.err.overlap';
        ranges.push([b.row_from, b.row_to]);
    }
    return null;
}
