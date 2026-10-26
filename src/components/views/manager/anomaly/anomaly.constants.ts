/**
 * anomaly.constants.ts — Configuration and styles for Fraud Shield
 */
import { AnomalyType } from '@/services/fraud-detection.service';

export type FilterType = 'all' | AnomalyType;

export const ANOMALY_CONFIG: Record<AnomalyType, { icon: string; color: string; bg: string; label: string }> = {
    impossible_velocity: { icon: 'speed', color: 'text-rose-500', bg: 'bg-rose-50', label: 'Impossible Rate' },
    post_collection_spike: { icon: 'electric_bolt', color: 'text-red-500', bg: 'bg-red-50', label: 'Post-Pickup Spike' },
    peer_outlier: { icon: 'group_off', color: 'text-amber-500', bg: 'bg-amber-50', label: 'Peer Outlier' },
    off_hours: { icon: 'schedule', color: 'text-blue-500', bg: 'bg-blue-50', label: 'Off Hours' },
    duplicate_proximity: { icon: 'content_copy', color: 'text-purple-500', bg: 'bg-purple-50', label: 'Duplicate Scan' },
};

export const SEVERITY_STYLES: Record<string, string> = {
    high: 'bg-rose-100 text-rose-700 border-rose-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-sky-100 text-sky-700 border-sky-200',
};

/** Claves i18n de los filtros (se pintan con t()) */
export const FILTER_LABELS: Record<FilterType, string> = {
    all: 'fraud.filter_all',
    impossible_velocity: 'fraud.filter_impossible_velocity',
    post_collection_spike: 'fraud.filter_post_collection_spike',
    peer_outlier: 'fraud.filter_peer_outlier',
    off_hours: 'fraud.filter_off_hours',
    duplicate_proximity: 'fraud.filter_duplicate_proximity',
};

export const RULE_BADGE: Record<string, { label: string; color: string }> = {
    elapsed_velocity: { label: '⏱ Elapsed Time', color: 'text-rose-600 bg-rose-50' },
    peer_comparison: { label: '👥 Peer Check', color: 'text-amber-600 bg-amber-50' },
    off_hours: { label: '🌙 Off Hours', color: 'text-blue-600 bg-blue-50' },
    duplicate: { label: '📋 Duplicate', color: 'text-purple-600 bg-purple-50' },
    grace_period_exempt: { label: '🌅 Grace Period', color: 'text-emerald-600 bg-emerald-50' },
};
