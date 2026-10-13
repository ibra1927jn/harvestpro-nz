/**
 * MFAGuard — roles privilegiados necesitan una sesión verificada con 2FA (aal2).
 * Antes bastaba con tener el factor configurado: la contraseña sola daba acceso.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useMFA', () => ({ useMFA: vi.fn() }));
vi.mock('./MFASetup', () => ({
  MFASetup: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="mfa-setup-modal">
      <button onClick={onComplete}>Complete MFA</button>
    </div>
  ),
}));
vi.mock('./MFAVerify', () => ({
  MFAVerify: ({ factorId, onSuccess, onCancel }: { factorId: string; onSuccess: () => void; onCancel: () => void }) => (
    <div data-testid="mfa-verify" data-factor={factorId}>
      <button onClick={onSuccess}>Code ok</button>
      <button onClick={onCancel}>Back</button>
    </div>
  ),
}));

import { useAuth } from '../context/AuthContext';
import { useMFA } from '../hooks/useMFA';
import { supabase } from '../services/supabase';
import { MFAGuard } from './MFAGuard';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseMFA = useMFA as ReturnType<typeof vi.fn>;
const signOut = vi.fn();

type Level = 'aal1' | 'aal2' | null;
function setAal(currentLevel: Level, nextLevel: Level) {
  return vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
    data: { currentLevel, nextLevel, currentAuthenticationMethods: [] },
    error: null,
  } as never);
}
function setup(role: string | undefined, isAuthenticated = true) {
  mockUseAuth.mockReturnValue({ isAuthenticated, currentRole: role, signOut });
  const checkMFAStatus = vi.fn().mockResolvedValue({
    hasVerifiedFactor: true,
    factors: [
      { id: 'f-unverified', status: 'unverified' },
      { id: 'f-verified', status: 'verified' },
    ],
  });
  mockUseMFA.mockReturnValue({ checkMFAStatus });
  return checkMFAStatus;
}
const renderGuard = () =>
  render(
    <MFAGuard>
      <div data-testid="protected-content">ok</div>
    </MFAGuard>
  );

describe('MFAGuard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signOut.mockReset();
  });

  it.each(['team_leader', 'runner', 'qc_inspector', 'logistics'])(
    'field role %s enters without 2FA and without checking',
    async role => {
      const aal = setAal('aal1', 'aal1');
      setup(role);
      renderGuard();
      expect(await screen.findByTestId('protected-content')).toBeTruthy();
      expect(aal).not.toHaveBeenCalled();
    }
  );

  it('signed-out user is not blocked', async () => {
    setAal(null, null);
    setup(undefined, false);
    renderGuard();
    expect(await screen.findByTestId('protected-content')).toBeTruthy();
  });

  it.each(['manager', 'admin', 'payroll_admin', 'hr_admin'])(
    '%s with 2FA set up but only a password session must enter the code',
    async role => {
      setAal('aal1', 'aal2');
      setup(role);
      renderGuard();
      const verify = await screen.findByTestId('mfa-verify');
      expect(verify.getAttribute('data-factor')).toBe('f-verified');
      expect(screen.queryByTestId('protected-content')).toBeNull();
    }
  );

  it('enters after the code is verified (session becomes aal2)', async () => {
    const aal = setAal('aal1', 'aal2');
    setup('manager');
    renderGuard();
    await screen.findByTestId('mfa-verify');
    aal.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    } as never);
    fireEvent.click(screen.getByText('Code ok'));
    expect(await screen.findByTestId('protected-content')).toBeTruthy();
  });

  it('going back from the code screen signs out', async () => {
    setAal('aal1', 'aal2');
    setup('admin');
    renderGuard();
    fireEvent.click(await screen.findByText('Back'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('already verified session (aal2) enters without asking again', async () => {
    setAal('aal2', 'aal2');
    const checkMFAStatus = setup('payroll_admin');
    renderGuard();
    expect(await screen.findByTestId('protected-content')).toBeTruthy();
    expect(checkMFAStatus).not.toHaveBeenCalled();
  });

  it('privileged role without any factor must set up 2FA', async () => {
    setAal('aal1', 'aal1');
    setup('hr_admin');
    renderGuard();
    expect(await screen.findByTestId('mfa-setup-modal')).toBeTruthy();
    expect(screen.getByText(/Two-Factor Authentication Required/)).toBeTruthy();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('fails closed when the check errors, and can retry', async () => {
    const aal = vi
      .spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      } as never);
    setup('manager');
    renderGuard();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByTestId('protected-content')).toBeNull();
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByTestId('protected-content')).toBeTruthy());
    expect(aal).toHaveBeenCalledTimes(2);
  });

  it('shows the spinner while checking', () => {
    vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockImplementation(
      () => new Promise(() => {})
    );
    setup('manager');
    renderGuard();
    expect(screen.getByText('Checking security settings...')).toBeTruthy();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });
});
