/**
 * Environment variable validation with Zod
 * Validates all VITE_ environment variables at app startup.
 * Fail fast in production if required vars are missing.
 */
import { z } from 'zod';
import { logger } from '@/utils/logger';

/** Schema for required + optional environment variables */
const envSchema = z.object({
    VITE_SUPABASE_URL: z
        .string({ error: 'VITE_SUPABASE_URL is required' })
        .url('VITE_SUPABASE_URL must be a valid URL'),

    VITE_SUPABASE_ANON_KEY: z
        .string({ error: 'VITE_SUPABASE_ANON_KEY is required' })
        .min(30, 'VITE_SUPABASE_ANON_KEY looks too short to be valid'),

    VITE_APP_VERSION: z.string().default('9.9.0'),
    VITE_ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
    VITE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    MODE: z.enum(['development', 'staging', 'production', 'mock']).default('development'),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validate environment variables at startup.
 * Returns validated env or throws with descriptive error.
 */
export function validateEnv(): ValidatedEnv {
    const raw = {
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
        VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION,
        VITE_ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS,
        VITE_LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL,
        MODE: import.meta.env.MODE,
    };

    const result = envSchema.safeParse(raw);

    if (!result.success) {
        const errors = result.error.issues
            .map(i => `  • ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        const msg = `❌ Environment validation failed:\n${errors}`;
        logger.error(msg);

        // In production, throw hard — don't run with bad config
        if (import.meta.env.MODE === 'production') {
            throw new Error(msg);
        }

        // In dev, warn but continue (allows running without full env)
        logger.warn('⚠️ Running with invalid environment — some features may not work.');
    }

    return result.success ? result.data : (raw as unknown as ValidatedEnv);
}
