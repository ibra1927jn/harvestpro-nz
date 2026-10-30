/**
 * Variables de entorno de relleno para los tests unitarios.
 *
 * `npm test` tiene que funcionar en un clon limpio, sin `.env.local` ni las variables
 * del CI. El cliente de Supabase (`src/services/supabase.ts`) se crea al importar el
 * módulo y lanza "supabaseUrl is required" si la URL está vacía, así que aquí se ponen
 * valores falsos SOLO si faltan. Nunca se conecta a nada: los tests unitarios mockean
 * Supabase. Los tests que necesitan un Supabase real van en `npm run test:integration`.
 *
 * Va el primero en `setupFiles` (vitest.config.ts y vitest.config.ci.ts), antes de
 * test-setup.ts. Vitest copia `process.env` a `import.meta.env` en cada fichero.
 */
const TEST_ENV_DEFAULTS: Record<string, string> = {
    VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
    // JWT falso (firma inválida, ref "placeholder"): no es una clave real
    VITE_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder-key-for-ci-tests-only',
};

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
    if (!process.env[key]) process.env[key] = value;
}
