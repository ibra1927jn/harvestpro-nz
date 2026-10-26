/**
 * Limpieza de datos personales antes de mandarlos a terceros (Sentry, PostHog).
 *
 * NZ Privacy Act 2020 (IPP 11/12): el email, el IRD y la cuenta bancaria de un
 * trabajador no pueden salir hacia un servicio de monitorización. Se borran:
 *  - por clave (email, ird_number, bank_account, picker_id, nombres...), y
 *  - por patrón dentro de cualquier texto (mensajes de error, URLs, breadcrumbs).
 * Se prefiere borrar de más a dejar escapar un dato.
 */

export const REDACTED = '[redacted]';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Cuenta bancaria NZ: banco-sucursal-cuenta-sufijo, p. ej. 12-3456-7890123-00 (o con espacios)
// (Sin lookbehind: Safari < 16.4 no lo entiende y el módulo no cargaría; el borde
// izquierdo va en el grupo 1 y se repone al sustituir.)
const NZ_BANK_RE = /(^|[^\w-])\d{2}[- ]\d{4}[- ]\d{7}[- ]\d{2,3}(?![\w-])/g;
// IRD: 8 o 9 cifras, juntas o en grupos (12-345-678, 123-456-789, 123 456 789).
// Sin guion ni letra pegados fuera, para no romper UUIDs ni nombres de fichero con hash.
const IRD_RE = /(^|[^\w-])\d{2,3}[- ]?\d{3}[- ]?\d{3}(?![\w-])/g;

/** Claves cuyo valor nunca sale, sea cual sea su contenido. */
const PII_KEYS = new Set([
  'email',
  'e_mail',
  'user_email',
  'phone',
  'phone_number',
  'mobile',
  'ird',
  'ird_number',
  'tax_number',
  'bank',
  'bank_account',
  'bank_account_number',
  'account_number',
  'full_name',
  'first_name',
  'last_name',
  'picker_name',
  'worker_name',
  'address',
  'date_of_birth',
  'dob',
  'picker_id',
  'password',
]);

export function isPiiKey(key: string): boolean {
  return PII_KEYS.has(key.toLowerCase());
}

/** Quita emails, cuentas bancarias NZ e IRD de un texto. */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(NZ_BANK_RE, '$1[redacted-bank]')
    .replace(IRD_RE, '$1[redacted-ird]');
}

const MAX_DEPTH = 8;

/**
 * Copia limpia de cualquier valor: textos sin PII, claves personales tapadas.
 * No muta la entrada. Profundidad acotada (ciclos o estructuras enormes).
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isPiiKey(k) ? REDACTED : scrubValue(v, depth + 1);
  }
  return out;
}

/** Propiedades de un evento de analítica: las claves personales se quitan, los textos se limpian. */
export function scrubProperties(
  props: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isPiiKey(k)) continue;
    out[k] = scrubValue(v, 1);
  }
  return out;
}
