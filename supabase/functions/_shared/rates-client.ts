/**
 * Cliente para LEER precios por cubeta (piece_rates, harvest_settings) de todos
 * los huertos dentro de una función que corre como el usuario.
 *
 * Desde 20261027050000_piece_rates_read_own_orchard cada uno lee solo los
 * precios de su huerto (admin, RRHH y nómina, todos). Pero el pago de una
 * persona se calcula con su día entero, y la gente rota entre huertos: el
 * complemento al mínimo de la parte de A depende de lo ganado en B. Para que
 * el cálculo salga igual que el de nómina, los precios se cargan con la
 * service role DESPUÉS de requireRole; lo demás (cubetas, fichajes, personas)
 * sigue con el cliente del usuario y su RLS. Los precios no se devuelven tal
 * cual: solo lo que se paga.
 *
 * calculate-payroll lee también con él la foto de una semana cerrada
 * (pay_weeks, solo nómina, RRHH y admin): al manager se le devuelve reducida
 * a su huerto (payroll-orchard.ts).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function pieceRatesReader() {
    return createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false, autoRefreshToken: false } },
    )
}
