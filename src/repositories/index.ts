/**
 * Typed Repository Layer — connects baseRepository to database.types.ts
 *
 * Each repository is a pre-typed instance of SupabaseRepository<T>
 * using the Row types from database.types.ts (source of truth).
 *
 * Solo se exportan las instancias que algún servicio usa; para otra tabla,
 * añade aquí su instancia tipada.
 */
import { SupabaseRepository } from './baseRepository';
import type { Database } from '@/types/database.types';

type Tables = Database['public']['Tables'];
export type ContractRow = Tables['contracts']['Row'];
export type TransportRequestRow = Tables['transport_requests']['Row'];

// ── Typed Repository Instances ──────────────────────
export const contractRepo = new SupabaseRepository<ContractRow>('contracts');
export const transportRequestRepo = new SupabaseRepository<TransportRequestRow>('transport_requests');
