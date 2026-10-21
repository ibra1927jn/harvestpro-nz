/**
 * InspectTab — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

vi.mock('./DistributionBar', () => ({
  default: ({ distribution }: any) => (
    <div data-testid="distribution-bar">Total: {distribution.total}</div>
  ),
}));

vi.mock('@/hooks/usePhotoCapture', () => ({
  usePhotoCapture: () => ({
    photoBlob: null,
    photoPreview: null,
    capturePhoto: vi.fn(),
    clearPhoto: vi.fn(),
    isCapturing: false,
  }),
}));

import InspectTab from './InspectTab';

const makePicker = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name,
    picker_id: `PK-${id}`,
    status: 'active' as const,
    current_row: 1,
    total_buckets_today: 10,
    hours: 4,
    team_leader_id: null,
    orchard_id: 'o1',
    avatar: name.substring(0, 2).toUpperCase(),
    role: 'picker',
    checked_in_today: true,
    ...extra,
  }) as any;

/** Nombres de los pickers (texto del <p> del nombre, sin el ID) en el orden de la lista */
const listedNames = () =>
  screen.getAllByRole('listitem').map(li => {
    const p = li.querySelector('p');
    return (p?.firstChild?.textContent ?? '').trim();
  });

describe('InspectTab', () => {
  const crew = [makePicker('p1', 'Alice'), makePicker('p2', 'Bob'), makePicker('p3', 'Charlie')];

  const distribution = { A: 10, B: 5, C: 2, reject: 1, total: 18 };

  const defaultProps = {
    crew,
    inspections: [] as any[],
    distribution,
    selectedPicker: null as any,
    setSelectedPicker: vi.fn(),
    notes: '',
    setNotes: vi.fn(),
    isSubmitting: false,
    lastGrade: null as any,
    onGrade: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders grade buttons', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByText('Grade A')).toBeTruthy();
    expect(screen.getByText('Grade B')).toBeTruthy();
    expect(screen.getByText('Grade C')).toBeTruthy();
  });

  it('renders Reject grade option', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('renders distribution bar', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByTestId('distribution-bar')).toBeTruthy();
  });

  it('shows distribution total', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByText('Total: 18')).toBeTruthy();
  });

  it('calls onGrade when grade button is clicked with selected picker', () => {
    render(<InspectTab {...defaultProps} selectedPicker={crew[0]} />);
    fireEvent.click(screen.getByText('Grade A'));
    expect(defaultProps.onGrade).toHaveBeenCalled();
  });

  it('disables grades when submitting', () => {
    render(<InspectTab {...defaultProps} isSubmitting={true} selectedPicker={crew[0]} />);
    const gradeA = screen.getByText('Grade A').closest('button');
    expect(gradeA?.hasAttribute('disabled')).toBe(true);
  });

  describe('picker selection', () => {
    it('selects a picker on tap', () => {
      const setSelectedPicker = vi.fn();
      render(<InspectTab {...defaultProps} setSelectedPicker={setSelectedPicker} />);
      fireEvent.click(screen.getByRole('button', { name: /Bob/ }));
      expect(setSelectedPicker).toHaveBeenCalledWith(crew[1]);
    });

    it('tapping the selected picker again deselects it', () => {
      const setSelectedPicker = vi.fn();
      render(<InspectTab {...defaultProps} selectedPicker={crew[1]} setSelectedPicker={setSelectedPicker} />);
      const bob = screen.getByRole('button', { name: /Bob/ });
      expect(bob.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(bob);
      expect(setSelectedPicker).toHaveBeenCalledWith(null);
    });

    it('shows a × button on the selected card that deselects', () => {
      const setSelectedPicker = vi.fn();
      render(<InspectTab {...defaultProps} selectedPicker={crew[0]} setSelectedPicker={setSelectedPicker} />);
      const clear = screen.getByRole('button', { name: 'Deselect picker' });
      fireEvent.click(clear);
      expect(setSelectedPicker).toHaveBeenCalledWith(null);
    });

    it('has no × button when nobody is selected', () => {
      render(<InspectTab {...defaultProps} />);
      expect(screen.queryByRole('button', { name: 'Deselect picker' })).toBeNull();
    });
  });

  describe('picker list', () => {
    it('lists only pickers: team leaders and runners are left out', () => {
      const mixed = [
        makePicker('tl', 'Tania Leader', { role: 'team_leader' }),
        makePicker('r1', 'Rudy Runner', { role: 'runner' }),
        makePicker('p1', 'Alice'),
        makePicker('p9', 'Zed Norole', { role: undefined }),
      ];
      render(<InspectTab {...defaultProps} crew={mixed} />);
      const names = listedNames();
      expect(names).toContain('Alice');
      expect(names).toContain('Zed Norole');
      expect(names).not.toContain('Tania Leader');
      expect(names).not.toContain('Rudy Runner');
    });

    it('orders checked-in pickers first, then by row, then by name', () => {
      const unordered = [
        makePicker('a', 'Row 9 present', { current_row: 9 }),
        makePicker('b', 'Row 2 absent', { current_row: 2, checked_in_today: false }),
        makePicker('c', 'Row 3 present', { current_row: 3 }),
        makePicker('d', 'No row present', { current_row: 0 }),
        makePicker('e', 'Row 3 present too', { current_row: 3 }),
      ];
      render(<InspectTab {...defaultProps} crew={unordered} />);
      // Por defecto solo los fichados; «ver todos» añade al que no ha fichado
      expect(listedNames()).toEqual([
        'Row 3 present', 'Row 3 present too', 'Row 9 present', 'No row present',
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Show all (1)' }));
      expect(listedNames()).toEqual([
        'Row 3 present', 'Row 3 present too', 'Row 9 present', 'No row present', 'Row 2 absent',
      ]);
      expect(screen.getByText('Not checked in')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Only checked in' }));
      expect(listedNames()).toHaveLength(4);
    });

    it('shows everyone (no toggle) when nobody has checked in yet', () => {
      const nobody = crew.map(p => ({ ...p, checked_in_today: false }));
      render(<InspectTab {...defaultProps} crew={nobody} />);
      expect(listedNames()).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
    });

    it('does not cut the list at 5', () => {
      const many = Array.from({ length: 12 }, (_, i) => makePicker(`p${i}`, `Picker ${i}`, { current_row: i + 1 }));
      render(<InspectTab {...defaultProps} crew={many} />);
      expect(listedNames()).toHaveLength(12);
    });

    it('marks pickers already inspected today', () => {
      render(<InspectTab {...defaultProps} inspections={[{ id: 'i1', picker_id: 'p2', grade: 'A' }]} />);
      const bob = screen.getByRole('button', { name: /Bob/ });
      expect(within(bob).getByText('Inspected today')).toBeTruthy();
      const alice = screen.getByRole('button', { name: /Alice/ });
      expect(within(alice).queryByText('Inspected today')).toBeNull();
    });

    it('search by name or ID looks across all pickers, checked in or not', () => {
      const withAbsent = [...crew, makePicker('p7', 'Dana Away', { checked_in_today: false })];
      render(<InspectTab {...defaultProps} crew={withAbsent} />);
      fireEvent.change(screen.getByLabelText('Search pickers'), { target: { value: 'pk-p7' } });
      expect(listedNames()).toHaveLength(1);
      expect(listedNames()[0]).toBe('Dana Away');
    });
  });

  describe('turbo mode', () => {
    const turboOn = () => fireEvent.click(screen.getByRole('switch', { name: 'Toggle turbo mode' }));

    it('advances to the next picker not yet inspected after saving', async () => {
      vi.useFakeTimers();
      const setSelectedPicker = vi.fn();
      const onGrade = vi.fn().mockResolvedValue(true);
      render(
        <InspectTab
          {...defaultProps}
          selectedPicker={crew[0]}
          setSelectedPicker={setSelectedPicker}
          onGrade={onGrade}
          inspections={[{ id: 'i1', picker_id: 'p2', grade: 'A' }]}
        />,
      );
      turboOn();
      await act(async () => {
        fireEvent.click(screen.getByText('Grade A'));
      });
      expect(onGrade).toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      // Bob ya está inspeccionado: salta a Charlie
      expect(setSelectedPicker).toHaveBeenCalledWith(crew[2]);
    });

    it('tapping the selected picker cancels the pending auto-advance', async () => {
      vi.useFakeTimers();
      const setSelectedPicker = vi.fn();
      const onGrade = vi.fn().mockResolvedValue(true);
      render(
        <InspectTab {...defaultProps} selectedPicker={crew[0]} setSelectedPicker={setSelectedPicker} onGrade={onGrade} />,
      );
      turboOn();
      await act(async () => {
        fireEvent.click(screen.getByText('Grade A'));
      });
      fireEvent.click(screen.getByRole('button', { name: /Alice/ }));
      expect(setSelectedPicker).toHaveBeenLastCalledWith(null);
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(setSelectedPicker).toHaveBeenCalledTimes(1);
    });

    it('does not advance when the save failed', async () => {
      vi.useFakeTimers();
      const setSelectedPicker = vi.fn();
      const onGrade = vi.fn().mockResolvedValue(false);
      render(
        <InspectTab {...defaultProps} selectedPicker={crew[0]} setSelectedPicker={setSelectedPicker} onGrade={onGrade} />,
      );
      turboOn();
      await act(async () => {
        fireEvent.click(screen.getByText('Grade A'));
      });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(setSelectedPicker).not.toHaveBeenCalled();
    });
  });
});
