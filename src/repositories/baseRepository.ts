/**
 * Base Supabase Repository
 * 
 * Generic repository pattern wrapping supabase.from() calls.
 * Provides type-safe CRUD operations with consistent error handling.
 * 
 * Usage:
 *   const userRepo = new SupabaseRepository<User>('users');
 *   const users = await userRepo.findAll({ role: 'manager' });
 *   const user = await userRepo.findById('some-uuid');
 */
import { logger } from '@/utils/logger';
import { supabase } from '@/services/supabase';
import type { Tables } from '@/types/database.types';

/** Rows that carry a soft-delete flag. Consumed by `softDelete()`. */
export interface SoftDeletable {
    is_active?: boolean | null;
}

export interface RepositoryResult<T> {
    data: T | null;
    error: string | null;
}

export interface RepositoryListResult<T> {
    data: T[];
    error: string | null;
}

export class SupabaseRepository<T extends Record<string, unknown>> {
    constructor(private readonly table: string) { }

    /**
     * Fetch all rows, optionally filtered by column-value pairs.
     */
    async findAll(
        filters?: Partial<Record<string, unknown>>,
        options?: { orderBy?: string; ascending?: boolean; limit?: number }
    ): Promise<RepositoryListResult<T>> {
        try {
            let query = supabase.from(this.table).select('*');

            if (filters) {
                for (const [key, value] of Object.entries(filters)) {
                    if (value !== undefined && value !== null) {
                        query = query.eq(key, value);
                    }
                }
            }

            if (options?.orderBy) {
                query = query.order(options.orderBy, {
                    ascending: options.ascending ?? true,
                });
            }

            if (options?.limit) {
                query = query.limit(options.limit);
            }

            const { data, error } = await query;

            if (error) {
                logger.error(`[Repository:${this.table}] findAll error:`, error);
                return { data: [], error: error.message };
            }

            return { data: (data as T[]) || [], error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] findAll exception:`, message);
            return { data: [], error: message };
        }
    }

    /**
     * Fetch a single row by ID.
     */
    async findById(id: string, idColumn = 'id'): Promise<RepositoryResult<T>> {
        try {
            const { data, error } = await supabase
                .from(this.table)
                .select('*')
                .eq(idColumn, id)
                .single();

            if (error) {
                logger.error(`[Repository:${this.table}] findById error:`, error);
                return { data: null, error: error.message };
            }

            return { data: data as T, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] findById exception:`, message);
            return { data: null, error: message };
        }
    }

    /**
     * Insert a new row. Returns the created row.
     */
    async create(record: Partial<T>): Promise<RepositoryResult<T>> {
        try {
            const { data, error } = await supabase
                .from(this.table)
                .insert(record)
                .select()
                .single();

            if (error) {
                logger.error(`[Repository:${this.table}] create error:`, error);
                return { data: null, error: error.message };
            }

            return { data: data as T, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] create exception:`, message);
            return { data: null, error: message };
        }
    }

    /**
     * Update a row by ID. Returns the updated row.
     */
    async update(
        id: string,
        updates: Partial<T>,
        idColumn = 'id'
    ): Promise<RepositoryResult<T>> {
        try {
            const { data, error } = await supabase
                .from(this.table)
                .update(updates)
                .eq(idColumn, id)
                .select()
                .single();

            if (error) {
                logger.error(`[Repository:${this.table}] update error:`, error);
                return { data: null, error: error.message };
            }

            return { data: data as T, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] update exception:`, message);
            return { data: null, error: message };
        }
    }

    /**
     * Hard-delete a row by id. For soft-delete semantics, use `softDelete`
     * — that path is typed against an `is_active` column on T so tables
     * without that column cannot silently take the wrong write.
     *
     * Previously this method accepted a `soft = true` default and double-
     * cast `{ is_active: false }` to `Partial<T>`, which compiled for
     * every caller even when the table had no `is_active` column (the
     * UPDATE then failed silently at runtime with an RLS-shaped error).
     * CLAUDE.md strict mode forbids this double-cast pattern.
     */
    async delete(id: string, idColumn = 'id'): Promise<{ error: string | null }> {
        try {
            const { error } = await supabase
                .from(this.table)
                .delete()
                .eq(idColumn, id);

            if (error) {
                logger.error(`[Repository:${this.table}] hard-delete error:`, error);
                return { error: error.message };
            }

            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] delete exception:`, message);
            return { error: message };
        }
    }

    /**
     * Soft-delete a row by setting `is_active = false`. This method is only
     * callable on repositories whose row type `T` declares an `is_active`
     * column: the `this: SupabaseRepository<T & SoftDeletable>` parameter
     * is a compile-time guard that rejects every other table at the call
     * site rather than falling back to a double-cast that could silently
     * misfire at runtime.
     */
    async softDelete(
        this: SupabaseRepository<T & SoftDeletable>,
        id: string,
        idColumn = 'id',
    ): Promise<{ error: string | null }> {
        try {
            // Cast is local to this one call and guarded by the `this`
            // constraint above: the method cannot be invoked on a
            // repository whose T lacks `is_active`, so the runtime UPDATE
            // always targets a real column.
            const { error } = await supabase
                .from(this.table)
                .update({ is_active: false } as Partial<T & SoftDeletable>)
                .eq(idColumn, id);

            if (error) {
                logger.error(`[Repository:${this.table}] soft-delete error:`, error);
                return { error: error.message };
            }
            return { error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Repository:${this.table}] softDelete exception:`, message);
            return { error: message };
        }
    }

    /**
     * Count rows matching filters.
     */
    async count(filters?: Partial<Record<string, unknown>>): Promise<number> {
        try {
            let query = supabase
                .from(this.table)
                .select('*', { count: 'exact', head: true });

            if (filters) {
                for (const [key, value] of Object.entries(filters)) {
                    if (value !== undefined && value !== null) {
                        query = query.eq(key, value);
                    }
                }
            }

            const { count, error } = await query;

            if (error) {
                logger.error(`[Repository:${this.table}] count error:`, error);
                return 0;
            }

            return count || 0;
        } catch (err) {
            logger.error(`[Repository:${this.table}] count exception:`, err);
            return 0;
        }
    }
}

// ── Pre-built Repositories ─────────────────────────────
// Tipos tomados de database.types.ts — Tables<T> para tablas dentro del bloque Tables,
// Todos los repositorios usan Tables<T> ahora que contracts esta dentro de Tables en el schema generado.

export const userRepository = new SupabaseRepository<Tables<'users'>>('users');
export const contractRepository = new SupabaseRepository<Tables<'contracts'>>('contracts');
export const attendanceRepository = new SupabaseRepository<Tables<'daily_attendance'>>('daily_attendance');
export const bucketRepository = new SupabaseRepository<Tables<'bucket_records'>>('bucket_records');
export const orchardRepository = new SupabaseRepository<Tables<'orchards'>>('orchards');
export const loginAttemptRepository = new SupabaseRepository<Tables<'login_attempts'>>('login_attempts');
export const accountLockRepository = new SupabaseRepository<Tables<'account_locks'>>('account_locks');
export const auditLogRepository = new SupabaseRepository<Tables<'audit_logs'>>('audit_logs');
