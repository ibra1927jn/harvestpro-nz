import { logger } from '@/utils/logger';
// =============================================
// CONFIGURATION SERVICE - Secure environment management
// =============================================

/**
 * Environment types for different deployment contexts
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Configuration keys that must be present
 */
interface RequiredConfig {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}

/**
 * Optional configuration with defaults
 */
interface OptionalConfig {
    APP_VERSION?: string;
    ENABLE_ANALYTICS?: boolean;
    LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

export interface AppConfig extends RequiredConfig, OptionalConfig {
    environment: Environment;
    isDevelopment: boolean;
    isProduction: boolean;
}

/**
 * Configuration validation errors
 */
export class ConfigurationError extends Error {
    constructor(
        message: string,
        public readonly missingKeys: string[] = []
    ) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

/**
 * Detect current environment based on various signals
 */
function detectEnvironment(): Environment {
    // Check Vite mode
    const mode = import.meta.env.MODE;
    if (mode === 'production') return 'production';
    if (mode === 'staging') return 'staging';

    // Any non-local host is treated as production
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host !== 'localhost' && host !== '127.0.0.1') {
            return 'production';
        }
    }

    return 'development';
}

// WARNING: CREDENTIALS REMOVED - Use .env files exclusively
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env or .env.local

/**
 * Load and validate configuration
 */
function loadConfig(): AppConfig {
    // En modo mock, forzar URL fake independientemente de .env.local
    // Motivo: Vite carga .env.local DESPUÉS de .env.[mode], por lo que
    // .env.local tiene mayor prioridad y sobreescribe .env.mock — bug conocido.
    if (import.meta.env.MODE === 'mock') {
        return {
            environment: 'development',
            isDevelopment: true,
            isProduction: false,
            SUPABASE_URL: 'http://localhost:54321',
            SUPABASE_ANON_KEY:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vY2staGFydmVzdHBybyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ1NzkxNjAwLCJleHAiOjE5NjEzNjc2MDB9.mock_anon_key',
            APP_VERSION: '9.9.0-mock',
            ENABLE_ANALYTICS: false,
            LOG_LEVEL: 'debug',
        };
    }

    const environment = detectEnvironment();
    const isDevelopment = environment === 'development';
    const isProduction = environment === 'production';

    // Get values from environment variables (Vite uses import.meta.env)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Track missing required keys
    const missingKeys: string[] = [];
    if (!supabaseUrl) missingKeys.push('VITE_SUPABASE_URL');
    if (!supabaseAnonKey) missingKeys.push('VITE_SUPABASE_ANON_KEY');

    // In production/staging, throw if env vars are missing
    if (missingKeys.length > 0 && (isProduction || environment === 'staging')) {
        const msg = `❌ [Config] Missing required environment variables: ${missingKeys.join(', ')}. ` +
            `Set them in the .env file.`;
        logger.error(msg);
        throw new ConfigurationError(msg, missingKeys);
    }

    // In development, warn but allow (will fail at runtime if truly missing)
    if (missingKeys.length > 0 && isDevelopment) {
        logger.warn(
            `WARNING [Config] Missing environment variables: ${missingKeys.join(', ')}. ` +
            `Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
        );
    }

    return {
        environment,
        isDevelopment,
        isProduction,
        SUPABASE_URL: supabaseUrl || '',
        SUPABASE_ANON_KEY: supabaseAnonKey || '',
        APP_VERSION: import.meta.env.VITE_APP_VERSION || '9.9.0',
        ENABLE_ANALYTICS: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
        LOG_LEVEL: (import.meta.env.VITE_LOG_LEVEL as AppConfig['LOG_LEVEL']) || 'info',
    };
}

// Create singleton config instance
let _config: AppConfig | null = null;

/**
 * Get application configuration
 * Throws ConfigurationError in production if required values are missing
 */
export function getConfig(): AppConfig {
    if (!_config) {
        _config = loadConfig();
    }
    return _config;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
    _config = null;
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(feature: string): boolean {
    const envVar = import.meta.env[`VITE_FEATURE_${feature.toUpperCase()}`];
    return envVar === 'true' || envVar === '1';
}

/**
 * Get current log level
 */
export function getLogLevel(): AppConfig['LOG_LEVEL'] {
    return getConfig().LOG_LEVEL || 'info';
}

export default {
    getConfig,
    resetConfig,
    isFeatureEnabled,
    getLogLevel,
    ConfigurationError,
};
