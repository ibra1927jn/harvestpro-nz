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

  it('renders the four final-grade buttons with the picker-inspection labels', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Grade A (Good)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grade B (Acceptable)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grade C (Needs correcting)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grade Reject (Severe)' })).toBeTruthy();
    // Las calidades de fruta (exportación / nacional / proceso) son de la cubeta, no de aquí
    expect(screen.queryByText('Export')).toBeNull();
    expect(screen.queryByText('Domestic')).toBeNull();
  });

  it('renders the six criteria with three states each', () => {
    render(<InspectTab {...defaultProps} />);
    for (const label of ['Ladder use', 'Tree damage', 'Fruit on the ground', 'Bucket fill', 'Size', 'Damaged fruit']) {
      const group = screen.getByRole('group', { name: label });
      expect(within(group).getByRole('button', { name: /Good/ })).toBeTruthy();
      expect(within(group).getByRole('button', { name: /So-so/ })).toBeTruthy();
      expect(within(group).getByRole('button', { name: /Bad/ })).toBeTruthy();
    }
  });

  it('renders distribution bar', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByTestId('distribution-bar')).toBeTruthy();
  });

  it('shows distribution total', () => {
    render(<InspectTab {...defaultProps} />);
    expect(screen.getByText('Total: 18')).toBeTruthy();
  });

  it('calls onGrade when grade button is clicked with selected picker (no criteria: grade only)', () => {
    render(<InspectTab {...defaultProps} selectedPicker={crew[0]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grade A (Good)' }));
    expect(defaultProps.onGrade).toHaveBeenCalledWith('A', null, expect.objectContaining({
      criteria: null, score: null, rowNumber: 1, informed: null, comfortable: null, wellbeingNotes: null,
    }));
  });

  it('disables grades when submitting', () => {
    render(<InspectTab {...defaultProps} isSubmitting={true} selectedPicker={crew[0]} />);
    const gradeA = screen.getByRole('button', { name: 'Grade A (Good)' });
    expect(gradeA.hasAttribute('disabled')).toBe(true);
  });

  describe('criteria', () => {
    const mark = (criterion: string, state: 'Good' | 'So-so' | 'Bad') =>
      fireEvent.click(within(screen.getByRole('group', { name: criterion })).getByRole('button', { name: new RegExp(`^${state}$`) }));
    const answer = (question: RegExp, value: 'Yes' | 'No' | 'No answer') =>
      fireEvent.click(within(screen.getByRole('group', { name: question })).getByRole('button', { name: value }));

    it('criteria buttons are disabled until a picker is selected', () => {
      render(<InspectTab {...defaultProps} />);
      const group = screen.getByRole('group', { name: 'Ladder use' });
      expect(within(group).getByRole('button', { name: /Good/ }).hasAttribute('disabled')).toBe(true);
    });

    it('suggests the computed grade live and pre-marks the final grade button', () => {
      render(<InspectTab {...defaultProps} selectedPicker={crew[0]} />);
      expect(screen.getByText(/No criteria checked/)).toBeTruthy();
      mark('Ladder use', 'Good');
      expect(screen.getByText('Suggested: Grade A (Good) · 100/100')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Grade A (Good)' }).getAttribute('aria-pressed')).toBe('true');
      mark('Size', 'So-so');
      expect(screen.getByText('Suggested: Grade B (Acceptable) · 75/100')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Grade B (Acceptable)' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Grade A (Good)' }).getAttribute('aria-pressed')).toBe('false');
      mark('Ladder use', 'Bad');
      expect(screen.getByText('Suggested: Grade Reject (Severe) · 0/100')).toBeTruthy();
      expect(screen.getByText('2/6 checked')).toBeTruthy();
    });

    it('tapping the same state again unmarks the criterion', () => {
      render(<InspectTab {...defaultProps} selectedPicker={crew[0]} />);
      mark('Size', 'Bad');
      expect(screen.getByText('1/6 checked')).toBeTruthy();
      mark('Size', 'Bad');
      expect(screen.getByText('0/6 checked')).toBeTruthy();
      expect(screen.getByText(/No criteria checked/)).toBeTruthy();
    });

    it('saves criteria, score, row and the wellbeing answers with the tapped grade', async () => {
      const onGrade = vi.fn().mockResolvedValue(true);
      render(<InspectTab {...defaultProps} selectedPicker={{ ...crew[0], current_row: 12 }} onGrade={onGrade} />);
      mark('Ladder use', 'Good');
      mark('Tree damage', 'Good');
      mark('Fruit on the ground', 'So-so');
      mark('Bucket fill', 'Good');
      mark('Size', 'Good');
      mark('Damaged fruit', 'Good');
      answer(/know what and how to pick/, 'No');
      answer(/comfortable in the team/, 'Yes');
      fireEvent.change(screen.getByLabelText('Wellbeing comment'), { target: { value: '  Needs a variety briefing ' } });
      // La sugerida es B; el inspector la cambia a C antes de guardar
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade C (Needs correcting)' }));
      });
      expect(onGrade).toHaveBeenCalledWith('C', null, {
        criteria: { ladder: 'ok', tree_damage: 'ok', fruit_on_ground: 'warn', bucket_fill: 'ok', size: 'ok', damaged_fruit: 'ok' },
        score: 92,
        rowNumber: 12,
        informed: false,
        comfortable: true,
        wellbeingNotes: 'Needs a variety briefing',
      });
      // Tras guardar, todo vuelve a vacío para la siguiente persona
      expect(screen.getByText('0/6 checked')).toBeTruthy();
      expect((screen.getByLabelText('Wellbeing comment') as HTMLInputElement).value).toBe('');
    });

    it('keeps what was marked when the save fails', async () => {
      const onGrade = vi.fn().mockResolvedValue(false);
      render(<InspectTab {...defaultProps} selectedPicker={crew[0]} onGrade={onGrade} />);
      mark('Size', 'Bad');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade C (Needs correcting)' }));
      });
      expect(screen.getByText('1/6 checked')).toBeTruthy();
    });

    it('clears the marks when the inspector switches to another picker', () => {
      const { rerender } = render(<InspectTab {...defaultProps} selectedPicker={crew[0]} />);
      mark('Size', 'Bad');
      expect(screen.getByText('1/6 checked')).toBeTruthy();
      rerender(<InspectTab {...defaultProps} selectedPicker={crew[1]} />);
      expect(screen.getByText('0/6 checked')).toBeTruthy();
    });
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

    const markAll = () => {
      for (const label of ['Ladder use', 'Tree damage', 'Fruit on the ground', 'Bucket fill', 'Size', 'Damaged fruit']) {
        fireEvent.click(within(screen.getByRole('group', { name: label })).getByRole('button', { name: /^Good$/ }));
      }
    };

    it('advances to the next picker not yet inspected after saving with all 6 criteria marked', async () => {
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
      markAll();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade A (Good)' }));
      });
      expect(onGrade).toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      // Bob ya está inspeccionado: salta a Charlie
      expect(setSelectedPicker).toHaveBeenCalledWith(crew[2]);
    });

    it('does not advance when the save had fewer than 6 criteria marked', async () => {
      vi.useFakeTimers();
      const setSelectedPicker = vi.fn();
      const onGrade = vi.fn().mockResolvedValue(true);
      render(
        <InspectTab {...defaultProps} selectedPicker={crew[0]} setSelectedPicker={setSelectedPicker} onGrade={onGrade} />,
      );
      turboOn();
      fireEvent.click(within(screen.getByRole('group', { name: 'Size' })).getByRole('button', { name: /^Good$/ }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade A (Good)' }));
      });
      expect(onGrade).toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(setSelectedPicker).not.toHaveBeenCalled();
    });

    it('tapping the selected picker cancels the pending auto-advance', async () => {
      vi.useFakeTimers();
      const setSelectedPicker = vi.fn();
      const onGrade = vi.fn().mockResolvedValue(true);
      render(
        <InspectTab {...defaultProps} selectedPicker={crew[0]} setSelectedPicker={setSelectedPicker} onGrade={onGrade} />,
      );
      turboOn();
      markAll();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade A (Good)' }));
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
      markAll();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Grade A (Good)' }));
      });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(setSelectedPicker).not.toHaveBeenCalled();
    });
  });
});
