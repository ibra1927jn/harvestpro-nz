import { logger } from '@/utils/logger';
import { nowNZST, todayNZST } from '@/utils/nzst';
import { userServiceRepository } from '@/repositories/user-service.repository';

export const userService = {
    // --- USERS & AUTH ---
    async getUserProfile(userId: string) {
        return userServiceRepository.getUserById(userId);
    },

    async getOrchardUsers(orchardId: string) {
        return userServiceRepository.getUsersByOrchard(orchardId);
    },

    // --- MANAGE REGISTERED USERS (TEAM LEADERS & RUNNERS) ---
    async getAvailableUsers(role?: string) {
        return userServiceRepository.getAvailableUsers(role);
    },

    async getAvailableTeamLeaders() {
        return userServiceRepository.getUsersByRole('team_leader');
    },

    async getAvailableRunners() {
        return userServiceRepository.getUsersByRole('runner');
    },

    async assignUserToOrchard(userId: string, orchardId: string) {
        if (!userId) throw new Error("User ID is required");
        if (!orchardId) throw new Error("Orchard ID is required (No orchard selected)");

        const user = await userServiceRepository.updateUserOrchard(userId, orchardId);

        if (user) {
            // Check if picker record already exists
            const existingPicker = await userServiceRepository.findPickerById(userId);

            if (existingPicker) {
                // UPDATE existing — don't touch picker_id to avoid unique constraint
                const { error: pickerError } = await userServiceRepository.updatePicker(userId, {
                    name: user.full_name,
                    role: user.role,
                    orchard_id: orchardId,
                    status: 'active',
                });

                if (pickerError) {
                    logger.error("Failed to update picker record:", pickerError);
                }
            } else {
                // INSERT new — generate unique picker_id from UUID
                const uniquePickerId = userId.replace(/-/g, '').substring(0, 8).toUpperCase();
                const { error: pickerError } = await userServiceRepository.insertPicker({
                    id: userId,
                    picker_id: uniquePickerId,
                    name: user.full_name,
                    role: user.role,
                    orchard_id: orchardId,
                    status: 'active',
                    safety_verified: true
                });

                if (pickerError) {
                    // If picker_id collides, try with a longer/random suffix
                    if (pickerError.code === '23505') {
                        const fallbackId = userId.replace(/-/g, '').substring(0, 6).toUpperCase() + Math.random().toString(36).substring(2, 4).toUpperCase();
                        const { error: retryError } = await userServiceRepository.insertPicker({
                            id: userId,
                            picker_id: fallbackId,
                            name: user.full_name,
                            role: user.role,
                            orchard_id: orchardId,
                                    status: 'active',
                            safety_verified: true
                        });
                        if (retryError) logger.error("Failed to insert picker (retry):", retryError);
                    } else {
                        logger.error("Failed to insert picker record:", pickerError);
                    }
                }
            }

            const today = todayNZST();
            try {
                const existingAttendance = await userServiceRepository.findTodayAttendance(userId, today);

                if (!existingAttendance) {
                    await userServiceRepository.insertAttendance({
                        picker_id: userId,
                        orchard_id: orchardId,
                        date: today,
                        status: 'present',
                        check_in: nowNZST(),
                        verified_by: userId // 🔧 R9-Fix6: Use actual assigning user, not zeroed UUID
                    });
                }
            } catch (e) {
                logger.warn("Auto-checkin error:", e);
            }
        }
    },

    async unassignUserFromOrchard(userId: string) {
        if (!userId) throw new Error("User ID is required");

        logger.info(`[UserService] Unlinking user ${userId} from orchard...`);

        // 1. Clear orchard from User Profile
        await userServiceRepository.clearUserOrchard(userId);
        logger.info(`[UserService] Users table updated for ${userId}`);

        // 2. Try to update picker record
        const { error: pickerError } = await userServiceRepository.updatePicker(userId, {
            orchard_id: null,
            team_leader_id: null,
            status: 'archived'
        });

        if (pickerError) {
            logger.error("[UserService] Picker update returned error:", pickerError);
        }

        // 3. Verify the update actually took effect (RLS can silently block updates)
        const verifyPicker = await userServiceRepository.verifyPickerState(userId);

        if (verifyPicker && verifyPicker.orchard_id !== null) {
            logger.info("[UserService] Update was silently blocked by RLS. Falling back to delete...");
            const { error: deleteError } = await userServiceRepository.deletePicker(userId);

            if (deleteError) {
                logger.error("[UserService] Picker delete also failed:", deleteError);
            } else {
                logger.info(`[UserService] Picker record deleted for ${userId}`);
            }
        } else if (verifyPicker) {
            logger.info(`[UserService] Picker record verified inactive for ${userId}`);
        } else {
            logger.info(`[UserService] No picker record found for ${userId} (already removed)`);
        }
    }
};
