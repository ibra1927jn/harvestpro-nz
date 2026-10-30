/**
 * queryClient.ts — React Query configuration
 * 
 * Central QueryClient with defaults tuned for a field-worker PWA:
 * - 5 min staleTime (field data doesn't change every second)
 * - 30 min gcTime (keep cache warm for offline-first)
 * - 2 retries with exponential backoff
 * - No refetch on window focus (workers switch apps a lot)
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,       // 5 minutes — field data is semi-static
            gcTime: 30 * 60 * 1000,          // 30 min cache retention
            retry: 2,                         // Retry twice on failure
            refetchOnWindowFocus: false,       // Workers switch apps constantly
            refetchOnReconnect: 'always',      // Critical: refetch when coming back online
        },
        mutations: {
            retry: 1,
        },
    },
});

// Query key factory — prevents magic strings, enables targeted invalidation
export const queryKeys = {
    // Attendance
    attendance: {
        all: ['attendance'] as const,
        daily: (orchardId: string) => ['attendance', 'daily', orchardId] as const,
        picker: (pickerId: string) => ['attendance', 'picker', pickerId] as const,
    },

    // Audit logs
    audit: {
        all: ['audit'] as const,
        logs: (filters?: unknown) => ['audit', 'logs', filters] as const,
    },

    // Compliance
    compliance: {
        all: ['compliance'] as const,
        alerts: (orchardId: string) => ['compliance', 'alerts', orchardId] as const,
    },

    // Pickers / Crew
    pickers: {
        all: ['pickers'] as const,
        byTeam: (teamLeaderId?: string, orchardId?: string) =>
            ['pickers', 'team', teamLeaderId, orchardId] as const,
    },

    // Ausencias (leave_requests)
    leave: {
        all: ['leave'] as const,
        onDay: (orchardId: string, ymd: string) => ['leave', 'day', orchardId, ymd] as const,
        requestedBy: (userId: string) => ['leave', 'requested-by', userId] as const,
    },

    // Timesheets
    timesheets: {
        all: ['timesheets'] as const,
        byOrchard: (orchardId: string, dateRange?: string) =>
            ['timesheets', orchardId, dateRange] as const,
    },
} as const;
