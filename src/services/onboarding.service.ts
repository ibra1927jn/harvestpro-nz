/**
 * onboarding.service.ts — Client-side onboarding orchestration
 *
 * Calls the provision-orchard Edge Function to create a new account.
 * Handles the multi-step signup form state and submission.
 */
import { supabase } from '@/services/supabase';
import { readableError } from '@/repositories/edge-functions.repository';

export interface OnboardingData {
  // Step 1: Organisation
  orchardName: string;
  orchardAddress?: string;
  totalRows: number;
  // Step 2: Admin account
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  // Step 3: Terms
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}

export interface OnboardingResult {
  success: boolean;
  orchardId?: string;
  orchardName?: string;
  userId?: string;
  error?: string;
}

export const onboardingService = {
  /**
   * Provision a new orchard account via the Edge Function.
   * Creates admin user, orchard, membership, settings, and wage rates atomically.
   */
  async provisionOrchard(data: OnboardingData): Promise<OnboardingResult> {
    const { data: result, error } = await supabase.functions.invoke<OnboardingResult>(
      'provision-orchard',
      {
        body: {
          orchard_name: data.orchardName.trim(),
          orchard_address: data.orchardAddress?.trim() || undefined,
          total_rows: data.totalRows,
          admin_email: data.adminEmail.trim().toLowerCase(),
          admin_password: data.adminPassword,
          admin_name: data.adminName.trim(),
          accepted_terms: data.acceptedTerms,
          accepted_privacy: data.acceptedPrivacy,
          terms_version: '1.0',
          privacy_version: '1.0',
        },
      }
    );

    if (error) {
      // El motivo real viene en el cuerpo de la respuesta (antes salía
      // "Edge Function returned a non-2xx status code")
      const readable = await readableError(error, 'provision-orchard');
      return { success: false, error: readable.message };
    }

    return result ?? { success: false, error: 'No response from server' };
  },

  /**
   * After provisioning, log the user in automatically.
   * Returns the session if successful.
   */
  async loginAfterSignup(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true, session: data.session };
  },

  /**
   * Validate step 1 data (orchard details)
   */
  validateOrgStep(data: Pick<OnboardingData, 'orchardName' | 'totalRows'>): string | null {
    if (!data.orchardName.trim()) return 'Orchard name is required';
    if (data.orchardName.trim().length < 2) return 'Orchard name must be at least 2 characters';
    if (data.orchardName.trim().length > 100) return 'Orchard name must be under 100 characters';
    if (data.totalRows < 1 || data.totalRows > 500) return 'Rows must be between 1 and 500';
    return null;
  },

  /**
   * Validate step 2 data (admin account)
   */
  validateAdminStep(data: Pick<OnboardingData, 'adminName' | 'adminEmail' | 'adminPassword'>): string | null {
    if (!data.adminName.trim()) return 'Your name is required';
    if (!data.adminEmail.includes('@') || !data.adminEmail.includes('.')) return 'Valid email address required';
    if (data.adminPassword.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(data.adminPassword)) return 'Password must contain at least one uppercase letter';
    if (!/[0-9]/.test(data.adminPassword)) return 'Password must contain at least one number';
    return null;
  },

  /**
   * Validate step 3 (terms acceptance)
   */
  validateTermsStep(data: Pick<OnboardingData, 'acceptedTerms' | 'acceptedPrivacy'>): string | null {
    if (!data.acceptedTerms) return 'You must accept the Terms of Service';
    if (!data.acceptedPrivacy) return 'You must accept the Privacy Policy';
    return null;
  },
};
