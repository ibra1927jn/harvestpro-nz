import { translate, type TFunction } from '@/i18n';
/**
 * Dead Letter Queue Types
 * Extracted from DeadLetterQueueView.tsx for reuse in tests and services.
 * @module components/views/manager/deadLetterQueue.types
 */
import type { QueuedSyncItem } from '@/services/db';

export interface DeadLetterItem {
    id: string;
    type: QueuedSyncItem['type'];
    payload: Record<string, unknown>;
    timestamp: number;
    retryCount: number;
    failureReason?: string;
    errorCode?: string;
    movedAt?: number;
}

export interface CategorizedErrors {
    critical: DeadLetterItem[];
    warnings: DeadLetterItem[];
    recent: DeadLetterItem[];
}

/**
 * Human-readable error tooltip based on Supabase/Postgres error codes.
 * Pure function — no side effects.
 */
export function getErrorTooltip(item: DeadLetterItem, t: TFunction = translate): string {
    const errorCode = item.errorCode;
    const errorMsg = item.failureReason;

    // Common error explanations
    if (errorCode?.includes('23503')) {
        return `❌ ${t('dlq.err.fk')}`;
    }
    if (errorCode?.includes('23505')) {
        return `⚠️ ${t('dlq.err.duplicate')}`;
    }
    if (errorCode?.includes('PGRST116')) {
        return `🔒 ${t('dlq.err.rls')}`;
    }
    if (errorMsg?.includes('archived')) {
        return `🚫 ${t('dlq.err.archived')}`;
    }
    if (errorMsg?.includes('Network')) {
        return `📡 ${t('dlq.err.network')}`;
    }
    return errorMsg || t('common.unknown_error');
}
