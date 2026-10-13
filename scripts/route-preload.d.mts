import type { Plugin } from 'vite';
export const STARTUP_MODULES: string[];
export const ROUTE_MODULES: Record<string, string[]>;
export function routePreloadPlugin(): Plugin;
