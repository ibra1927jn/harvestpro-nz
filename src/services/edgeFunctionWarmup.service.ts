/**
 * edgeFunctionWarmup.service.ts — Mantiene calientes las Edge Functions críticas
 *
 * Las Edge Functions de Supabase (Deno workers) se enfrían tras ~5 min de inactividad.
 * El cold start tiene una penalización de 300-600ms — perceptible en el flujo de
 * escaneo QR (record-bucket) y el check-in matutino (manage-attendance).
 *
 * Estrategia: un solo ping al iniciar sesión (con conexión), para que el primer
 * escaneo o fichaje del día no espere el arranque. Las funciones responden al
 * payload { _warmup: true } con un 200 inmediato sin ejecutar lógica de negocio.
 * Antes se repetía cada 4 min: despertaba la radio del móvil 15 veces por hora
 * durante todo el turno (batería) para ahorrar ~0,5 s de vez en cuando.
 *
 * Seguridad: el warmup requiere un JWT válido — el mismo del usuario autenticado.
 * No es posible hacer warmup sin estar logueado.
 *
 * Consumo: 1–4 llamadas por inicio de sesión.
 */
import { logger } from '@/utils/logger';
import { edgeFunctionsRepository } from '@/repositories/edge-functions.repository';
import { supabase } from '@/services/supabase';
import { mfaRequiredFor } from '@/config/mfa';
import { Role } from '@/types/app.types';

/** Funciones críticas: campo (scan, attendance) + oficina (payroll, compliance) */
const CRITICAL_FUNCTIONS = [
  'manage-attendance',
  'record-bucket',
  'calculate-payroll',
  'check-compliance',
] as const;
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

let started = false;
let activeFunctions: CriticalFunction[] = [];
let activeRole: Role | null | undefined = null;

/**
 * Un rol con 2FA obligatorio aún sin código (sesión aal1) recibiría 403 del
 * servidor: no se calienta hasta que la sesión sea aal2 (lo dice el token
 * local, sin red): en ese caso no se calienta.
 */
async function sessionCanCall(): Promise<boolean> {
  if (!mfaRequiredFor(activeRole)) return true;
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.currentLevel === 'aal2';
  } catch {
    return false;
  }
}

async function pingAll(): Promise<void> {
  // Sin red o sin 2FA todavía: no cuenta como hecho, el siguiente start() lo intenta
  if (!navigator.onLine || !(await sessionCanCall())) {
    started = false;
    return;
  }

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
   * Calienta una vez las funciones que el rol puede invocar.
   * Llamar tras login — AuthContext (onAuthStateChange / carga de sesión).
   * Idempotente hasta stop(): varias llamadas en la misma sesión no repiten pings.
   */
  start(role: Role | null | undefined): void {
    if (started) return;
    activeRole = role;
    activeFunctions = warmupFunctionsFor(role);
    if (activeFunctions.length === 0) return;
    started = true;
    pingAll();
  },

  /** Al cerrar sesión: la siguiente sesión vuelve a calentar. */
  stop(): void {
    started = false;
    activeFunctions = [];
    activeRole = null;
  },
};
