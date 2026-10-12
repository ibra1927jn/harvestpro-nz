/**
 * rowSlice - Row Assignment Management
 *
 * Manages row assignments with Supabase persistence and optimistic updates.
 * Reads orchard.id from global state via get().
 *
 * KEY: assignRows() is the batch function that does ONE atomic state update.
 *      assignRow() delegates to assignRows() for backward compatibility.
 */
import { StateCreator } from 'zustand';
import { logger } from '@/utils/logger';
import { safeUUID } from '@/utils/uuid';
import { RowAssignment } from '@/types';
import type { HarvestStoreState, RowSlice } from '../storeTypes';
import { rowRepository } from '@/repositories/row.repository';
import { analytics } from '@/config/analytics';

// --- Slice Creator ---
export const createRowSlice: StateCreator<HarvestStoreState, [], [], RowSlice> = (set, get) => ({
  rowAssignments: [],

  /**
   * assignRows — BATCH: assign a team to multiple rows in ONE atomic update.
   *
   * 1. Removes all old assignments involving ANY of these pickers
   * 2. Creates one RowAssignment per row number
   * 3. Sets current_row to first row (for Supabase persistence)
   * 4. ONE set() call — no sequential clobbering
   */
  assignRows: async (rowNumbers, side, pickerIds) => {
    const orchardId = get().orchard?.id;
    if (!orchardId || rowNumbers.length === 0) return;

    // Equipo: el team leader que va en el grupo o, si no, el de sus pickers
    const crewNow = get().crew;
    const members = crewNow.filter(p => pickerIds.includes(p.id));
    const teamLeaderId =
      members.find(p => p.role === 'team_leader')?.id ??
      members.find(p => p.team_leader_id)?.team_leader_id ??
      null;

    // Build one RowAssignment entry per row
    const newEntries: RowAssignment[] = rowNumbers.map(rn => ({
      id: safeUUID(),
      row_number: rn,
      side,
      assigned_pickers: pickerIds,
      completion_percentage: 0,
      team_leader_id: teamLeaderId,
    }));

    // Lo que había antes (para deshacer si no se guarda, y para retirar en el servidor)
    const before = { rowAssignments: get().rowAssignments, crew: get().crew };
    const replacedIds = before.rowAssignments
      .filter(ra => ra.assigned_pickers.some(pid => pickerIds.includes(pid)))
      .map(ra => ra.id)
      // las reconstruidas en el móvil ("rebuilt-…") no existen en el servidor
      .filter(id => /^[0-9a-f-]{36}$/i.test(id));

    // ATOMIC state update — removes old team entries, adds all new ones at once
    set(state => ({
      rowAssignments: [
        // Keep assignments that don't involve any of these pickers
        ...state.rowAssignments.filter(
          ra => !ra.assigned_pickers.some(pid => pickerIds.includes(pid))
        ),
        // Add all new entries
        ...newEntries,
      ],
      // Set current_row to first row (Supabase only stores one value)
      crew: state.crew.map(p =>
        pickerIds.includes(p.id) ? { ...p, current_row: rowNumbers[0] } : p
      ),
    }));

    // Guardar en el servidor: si no se puede, se deshace y se avisa (el team
    // leader no recibiría nada y el manager creería que sí)
    try {
      const { error: upsertError } = await rowRepository.upsertRowAssignments(orchardId, newEntries);
      if (upsertError) throw new Error(upsertError.message);

      const { error } = await rowRepository.updatePickerRows(pickerIds, rowNumbers[0]);
      if (error) {
        logger.warn('⚠️ [Store] Picker current_row update failed (non-fatal):', error);
      }
      const { error: retireError } = await rowRepository.retireAssignments(replacedIds);
      if (retireError) logger.warn('⚠️ [Store] Old row assignments not retired:', retireError);

      logger.info(
        `📍 [Store] Rows ${rowNumbers.join(',')} — ${pickerIds.length} pickers updated in Supabase`
      );
      // 📊 PostHog: Track row assignment
      analytics.trackRowAssignment(pickerIds[0], rowNumbers[0]);
    } catch (e) {
      logger.error('❌ [Store] Row assignment not saved:', e);
      set(before);
      throw new Error('Row assignment not saved — check your connection and try again');
    }
  },

  /** assignRow — single row convenience, delegates to assignRows */
  assignRow: async (rowNumber, side, pickerIds) => {
    await get().assignRows([rowNumber], side, pickerIds);
  },

  updateRowProgress: async (rowId, percentage) => {
    // 🔧 V7: Save previous value for rollback
    const previous = get().rowAssignments.find(r => r.id === rowId);
    const prevPercentage = previous?.completion_percentage ?? 0;

    // Optimistic update
    set(state => ({
      rowAssignments: state.rowAssignments.map(r =>
        r.id === rowId ? { ...r, completion_percentage: percentage } : r
      ),
    }));

    try {
      await rowRepository.updateProgress(rowId, percentage);
    } catch (e) {
      logger.error('❌ [Store] Failed to update row progress:', e);
      // Rollback
      set(state => ({
        rowAssignments: state.rowAssignments.map(r =>
          r.id === rowId ? { ...r, completion_percentage: prevPercentage } : r
        ),
      }));
    }
  },

  completeRow: async rowId => {
    // 🔧 V7: Save previous value for rollback
    const previous = get().rowAssignments.find(r => r.id === rowId);
    const prevPercentage = previous?.completion_percentage ?? 0;

    set(state => ({
      rowAssignments: state.rowAssignments.map(r =>
        r.id === rowId ? { ...r, completion_percentage: 100 } : r
      ),
    }));

    try {
      await rowRepository.completeRow(rowId);
    } catch (e) {
      logger.error('❌ [Store] Failed to complete row:', e);
      // Rollback
      set(state => ({
        rowAssignments: state.rowAssignments.map(r =>
          r.id === rowId ? { ...r, completion_percentage: prevPercentage } : r
        ),
      }));
    }
  },
});
