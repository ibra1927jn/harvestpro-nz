/**
 * edgeFunctionWarmup.service.ts — Mantiene calientes las Edge Functions críticas
 *
 * Las Edge Functions de Supabase (Deno workers) se enfrían tras ~5 min de inactividad.
 * El cold start tiene una penalización de 300-600ms — perceptible en el flujo de
 * escaneo QR (record-bucket) y el check-in matutino (manage-attendance).
 *
 * Estrategia: ping cada WARMUP_INTERVAL_MS mientras el usuario está autenticado
 * y hay conexión. Las funciones responden al payload { _warmup: true } con un
 * 200 inmediato sin ejecutar lógica de negocio.
 *
 * Seguridad: el warmup requiere un JWT válido — el mismo del usuario autenticado.
 * No es posible hacer warmup sin estar logueado.
 *
 * Consumo: 4 llamadas cada 4 min = ~360 llamadas/día por usuario activo.
 * Bien dentro de los límites de Supabase (500k invocaciones/mes en Pro plan).
 */
import { logger } from '@/utils/logger';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { Role } from '@/types/app.types';

/** 4 minutos — Supabase cold-starts tras ~5 min de inactividad */
const WARMUP_INTERVAL_MS = 4 * 60 * 1000;

/** Funciones críticas: campo (scan, attendance) + oficina (payroll, compliance) */
const CRITICAL_FUNCTIONS = ['manage-attendance', 'record-bucket', 'calculate-payroll', 'check-compliance'] as const;
type CriticalFunction = (typeof CRITICAL_FUNCTIONS)[number];

/**
 * Roles que cada función acepta (mismo requireRole que en supabase/functions).
 * Pingar una función que el rol no puede usar solo gasta datos móviles y
 * devuelve 403 (y error en consola) en cada ronda.
 */
const ALLOWED_ROLES: Record<CriticalFunction, readonly Role[]> = {
  'manage-attendance': [Role.ADMIN, Role.MANAGER, Role.TEAM_LEADER],
  'record-bucket': [Role.ADMIN, Role.MANAGER, Role.TEAM_LEADER, Role.RUNNER],
  'calculate-payroll': [Role.ADMIN, Role.MANAGER, Role.PAYROLL_ADMIN, Role.HR_ADMIN],
  'check-compliance': [Role.ADMIN, Role.MANAGER, Role.TEAM_LEADER],
};

/** Funciones que tiene sentido calentar para un rol (sin rol: ninguna). */
export function warmupFunctionsFor(role: Role | null | undefined): CriticalFunction[] {
  if (!role) return [];
  return CRITICAL_FUNCTIONS.filter(fn => ALLOWED_ROLES[fn].includes(role));
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let activeFunctions: CriticalFunction[] = [];

async function pingAll(): Promise<void> {
  if (!navigator.onLine) return;

  for (const fn of activeFunctions) {
    try {
      // Sin reintentos: un warmup fallido no merece más tráfico
      await edgeFunctionsRepository.invoke(fn, { _warmup: true }, { maxRetries: 0 });
      logger.info(`[Warmup] ✅ ${fn} warm`);
    } catch {
      // Silencioso — si falla el warmup, la siguiente llamada real tendrá cold start
      // pero no se interrumpe la experiencia del usuario
      logger.info(`[Warmup] ⚠️ ${fn} ping failed (next call may have cold start)`);
    }
  }
}

export const edgeFunctionWarmupService = {
  /**
   * Inicia el warmup periódico.
   * Llamar tras login exitoso — AuthContext.signIn / onAuthStateChange SIGNED_IN.
   * Solo calienta las funciones que el rol puede invocar.
   */
  start(role: Role | null | undefined): void {
    if (intervalId !== null) return; // Ya está corriendo
    activeFunctions = warmupFunctionsFor(role);
    if (activeFunctions.length === 0) return;

    // Primer ping inmediato — calienta las funciones al arrancar sesión
    pingAll();

    intervalId = setInterval(pingAll, WARMUP_INTERVAL_MS);
    logger.info(`[Warmup] Started — pinging every ${WARMUP_INTERVAL_MS / 60_000}min`);
  },

  /**
   * Detiene el warmup periódico.
   * Llamar en signOut para no consumir llamadas después del logout.
   */
  stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('[Warmup] Stopped');
    }
  },
};
