/**
 * Roll call con TalkBack: cada botón dice a quién ficha y el resultado se anuncia.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const checkIn = vi.fn().mockResolvedValue(undefined);
const checkOut = vi.fn().mockResolvedValue(undefined);

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'tl1', orchard_id: 'o1' } }) }));
vi.mock('@/hooks/useAttendance', () => ({
  useAttendance: () => ({
    loading: false,
    processing: null,
    mergedList: [
      { id: 'p1', name: 'Ana Present', isPresent: true, breakMissing: true, attendanceRecord: { id: 'att-1', check_in: '2026-10-13T07:00:00+13:00' } },
      { id: 'p2', name: 'Bea Absent', isPresent: false },
    ],
    stats: { present: 1, absent: 1, total: 2 },
    checkIn,
    checkOut,
  }),
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import AttendanceView from './AttendanceView';
import { subscribeAnnouncer, resetAnnouncerForTests } from '@/services/announcer';

describe('AttendanceView accessibility', () => {
  beforeEach(() => {
    resetAnnouncerForTests();
    checkIn.mockClear();
    checkOut.mockClear();
  });

  it('names the picker on each check-in / check-out button', () => {
    render(<AttendanceView />);
    expect(screen.getByRole('button', { name: 'Check out Ana Present' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check in Bea Absent' })).toBeInTheDocument();
  });

  it('announces a successful check-in and check-out', async () => {
    const heard: string[] = [];
    const off = subscribeAnnouncer(m => heard.push(m));
    render(<AttendanceView />);
    fireEvent.click(screen.getByRole('button', { name: 'Check in Bea Absent' }));
    await waitFor(() => expect(heard).toContain('Bea Absent checked in.'));
    fireEvent.click(screen.getByRole('button', { name: 'Check out Ana Present' }));
    await waitFor(() => expect(heard).toContain('Ana Present checked out.'));
    off();
    expect(checkOut).toHaveBeenCalledWith('att-1');
  });

  it('warns (and tells TalkBack) when a present picker has no meal break recorded', () => {
    render(<AttendanceView />);
    const warning = screen.getByText('Meal break not recorded');
    expect(warning.textContent).toContain('Record the break time in the Timesheet tab');
    expect(screen.getAllByText('Meal break not recorded')).toHaveLength(1);
  });

  // #7: el nombre es un botón aparte que abre el perfil; no toca el fichaje
  it('tapping the name opens the picker profile without checking anyone out', async () => {
    const { useHarvestStore } = await import('@/stores/useHarvestStore');
    render(<AttendanceView />);
    fireEvent.click(screen.getByRole('button', { name: "Open Ana Present's profile" }));
    expect(useHarvestStore.getState().pickerProfileId).toBe('p1');
    expect(checkOut).not.toHaveBeenCalled();
  });

  it('does not add a second main landmark inside the page layout', () => {
    render(<AttendanceView />);
    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Daily Roll Call' })).toBeInTheDocument();
  });
});
