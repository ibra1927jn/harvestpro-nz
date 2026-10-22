/**
 * runnersNow — qué está haciendo cada runner del huerto, derivado de los datos
 * (sin que nadie lo teclee). Módulo puro, sin React.
 *
 *   driver    → lleva un tractor / camión / ute activo (fleet_vehicles.driver_id)
 *   forklift  → lleva un forklift activo
 *   on_foot   → su último escaneo de cubeta tiene menos de 10 min: «recogiendo · fila N»
 *   waiting   → fichado, lleva más de 10 min sin escanear: «en espera» (en la fila N)
 *   idle      → fichado, sin vehículo y sin ningún escaneo hoy: «sin actividad»
 * (Revisión 2026-10-21, punto 13: «<10 min recogiendo; sin escaneo en 15 min en
 *  espera; sin vehículo ni escaneo, sin actividad». Entre 10 y 15 min ya no está
 *  recogiendo, así que cuenta como en espera.)
 *
 * Un runner sin tramo abierto hoy no está «en el huerto», salvo que haya
 * escaneado algo hoy (entonces se enseña con aviso «sin fichar»).
 */
import type { Picker, BucketRecord } from '@/types';
import type { Tractor } from '@/services/logistics-dept.service';
import { isPresentToday, selectRunners, selectPresentPickers } from '@/services/harvestMetrics/roster';

export type RunnerActivity = 'driver' | 'forklift' | 'on_foot' | 'waiting' | 'idle';

export interface RunnerNow {
    id: string;
    name: string;
    avatar: string;
    activity: RunnerActivity;
    /** Fila del último escaneo (a pie) */
    row: number | null;
    /** Minutos desde el último escaneo; null si no hay */
    minutesSinceScan: number | null;
    /** Vehículo que lleva, si es driver / forklift */
    vehicle: { id: string; name: string; type: Tractor['type']; zone: string; binsLoaded: number; maxCapacity: number } | null;
    /** Fichado hoy (tramo abierto) */
    checkedIn: boolean;
}

/** Hasta aquí el último escaneo cuenta como «recogiendo»; después, «en espera» */
export const ON_FOOT_MAX_MINUTES = 10;

function toMs(ts: string | null | undefined): number | null {
    if (!ts) return null;
    const ms = new Date(ts).getTime();
    return Number.isFinite(ms) ? ms : null;
}

export function runnersNow(params: {
    /** Plantilla con el fichaje de hoy ya fusionado (crew del store) */
    crew: ReadonlyArray<Picker>;
    fleet: ReadonlyArray<Tractor>;
    bucketRecords: ReadonlyArray<BucketRecord>;
    now?: Date;
}): RunnerNow[] {
    const nowMs = (params.now ?? new Date()).getTime();

    // Último escaneo por usuario que escaneó
    const lastScan = new Map<string, { ms: number; row: number | null }>();
    for (const b of params.bucketRecords) {
        if (!b.scanned_by) continue;
        const ms = toMs(b.scanned_at ?? b.created_at ?? b.timestamp);
        if (ms === null) continue;
        const prev = lastScan.get(b.scanned_by);
        if (!prev || ms > prev.ms) lastScan.set(b.scanned_by, { ms, row: b.row_number ?? null });
    }

    const vehicleByDriver = new Map<string, Tractor>();
    for (const v of params.fleet) {
        if (v.driver_id && v.status === 'active') vehicleByDriver.set(v.driver_id, v);
    }

    const out: RunnerNow[] = [];
    for (const p of selectRunners([...params.crew])) {
        const scan = lastScan.get(p.id);
        const checkedIn = isPresentToday(p);
        if (!checkedIn && !scan) continue;

        const minutes = scan ? Math.max(0, Math.round((nowMs - scan.ms) / 60_000)) : null;
        const vehicle = vehicleByDriver.get(p.id) ?? null;
        let activity: RunnerActivity;
        if (vehicle) activity = vehicle.type === 'forklift' ? 'forklift' : 'driver';
        else if (minutes === null) activity = 'idle';
        else if (minutes <= ON_FOOT_MAX_MINUTES) activity = 'on_foot';
        else activity = 'waiting';

        out.push({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            activity,
            row: scan?.row ?? null,
            minutesSinceScan: minutes,
            vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, type: vehicle.type, zone: vehicle.zone, binsLoaded: vehicle.bins_loaded, maxCapacity: vehicle.max_capacity } : null,
            checkedIn,
        });
    }

    const order: Record<RunnerActivity, number> = { on_foot: 0, driver: 1, forklift: 1, waiting: 2, idle: 3 };
    return out.sort((a, b) => (order[a.activity] - order[b.activity]) || a.name.localeCompare(b.name));
}

/** Pickers trabajando por fila (para pintar el mapa): fila → nº de pickers */
export function pickersByRow(crew: ReadonlyArray<Picker>): Map<number, number> {
    const m = new Map<number, number>();
    for (const p of selectPresentPickers([...crew])) {
        if (!p.current_row) continue;
        m.set(p.current_row, (m.get(p.current_row) ?? 0) + 1);
    }
    return m;
}
