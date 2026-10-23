// deno test --allow-all supabase/functions/_shared/device_time_test.ts
// Hora de los fichajes: la del servidor; la del móvil solo sin red, corregida y nunca del futuro.
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { DeviceTimeError, resolveDeviceTime } from './device-time.ts'

const MIN = 60_000
const NOW = Date.parse('2026-10-24T02:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

Deno.test('without a phone time the server time is used and no skew is stored', () => {
    assertEquals(resolveDeviceTime(undefined, NOW), { at: iso(NOW), skewMs: null })
})

Deno.test('a queued phone time from earlier is kept when the phone clock is right', () => {
    assertEquals(resolveDeviceTime(iso(NOW - 3 * 60 * MIN), NOW, NOW, 0), { at: iso(NOW - 3 * 60 * MIN), skewMs: 0 })
    // Ruido de la red (menos de 2 min): no se toca
    assertEquals(resolveDeviceTime(iso(NOW - 60 * MIN), NOW, NOW - 30_000, 0).at, iso(NOW - 60 * MIN))
})

Deno.test('a phone clock behind is corrected with the skew measured now', () => {
    // El móvil va 20 min atrasado: fichó a las "13:00" de su reloj = 13:20 de verdad
    const r = resolveDeviceTime(iso(NOW - 60 * MIN), NOW, NOW - 20 * MIN, 0)
    assertEquals(r, { at: iso(NOW - 40 * MIN), skewMs: 20 * MIN })
})

Deno.test('the correction the phone already applied is not applied twice', () => {
    const r = resolveDeviceTime(iso(NOW - 40 * MIN), NOW, NOW - 20 * MIN, 20 * MIN)
    assertEquals(r, { at: iso(NOW - 40 * MIN), skewMs: 20 * MIN })
})

Deno.test('a phone clock ahead is corrected; the result is never in the future', () => {
    // Móvil 1 h adelantado, fichó hace 10 min (su reloj marca +50 min)
    const r = resolveDeviceTime(iso(NOW + 50 * MIN), NOW, NOW + 60 * MIN, 0)
    assertEquals(r, { at: iso(NOW - 10 * MIN), skewMs: -60 * MIN })
    // Un par de minutos por delante sin explicación: hora del servidor
    assertEquals(resolveDeviceTime(iso(NOW + 3 * MIN), NOW, null, 0).at, iso(NOW))
})

Deno.test('impossible times are rejected', () => {
    assertThrows(() => resolveDeviceTime(iso(NOW + 60 * MIN), NOW, null, 0), DeviceTimeError, 'TIME_OUT_OF_RANGE')
    assertThrows(() => resolveDeviceTime(iso(NOW - 40 * 60 * MIN), NOW, NOW, 0), DeviceTimeError, 'TIME_OUT_OF_RANGE')
    assertThrows(() => resolveDeviceTime('yesterday', NOW), DeviceTimeError)
    assert(true)
})
