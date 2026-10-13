/**
 * Mensajes de error de Supabase Auth (vienen en inglés del servidor) → idioma de la app.
 * Los que no se conocen se enseñan tal cual.
 */
import type { TFunction } from './index';

const KNOWN: [RegExp, string][] = [
    [/invalid login credentials/i, 'login.err.invalid_credentials'],
    [/email not confirmed/i, 'login.err.email_not_confirmed'],
    [/user already registered/i, 'login.err.already_registered'],
    [/password should be at least/i, 'login.err.password_short'],
    [/failed to fetch|network/i, 'login.err.network'],
    [/rate limit|too many requests/i, 'login.err.rate_limit'],
];

export function authErrorText(t: TFunction, message: string): string {
    const hit = KNOWN.find(([re]) => re.test(message));
    return hit ? t(hit[1]) : message;
}
