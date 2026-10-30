/**
 * Tests for manager view sub-components (pure presentational)
 * KpiCards, GoalProgress, ProgressRing
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';

// ── KpiCards ─────────────────────────────────────────
import KpiCards from './weekly-report/KpiCards';

describe('KpiCards', () => {
  const cards = [
    {
      icon: 'agriculture',
      label: 'Total Buckets',
      value: '1,234',
      gradient: 'from-blue-50 to-blue-100',
      iconBg: 'bg-blue-500',
    },
    {
      icon: 'scale',
      label: 'Total Tons',
      value: '51.4',
      gradient: 'from-green-50 to-green-100',
      iconBg: 'bg-green-500',
    },
  ];

  it('renders all cards', () => {
    render(<KpiCards cards={cards} />);
    expect(screen.getByText('Total Buckets')).toBeTruthy();
    expect(screen.getByText('Total Tons')).toBeTruthy();
  });

  it('displays card values', () => {
    render(<KpiCards cards={cards} />);
    expect(screen.getByText('1,234')).toBeTruthy();
    expect(screen.getByText('51.4')).toBeTruthy();
  });

  it('renders icons', () => {
    render(<KpiCards cards={cards} />);
    expect(screen.getByText('agriculture')).toBeTruthy();
    expect(screen.getByText('scale')).toBeTruthy();
  });

  it('handles empty cards array', () => {
    const { container } = render(<KpiCards cards={[]} />);
    expect(container.querySelector('.grid')).toBeTruthy();
  });
});

// ── ProgressRing ─────────────────────────────────────
import ProgressRing from './orchard-map/ProgressRing';

describe('ProgressRing', () => {
  it('renders an SVG', () => {
    const { container } = render(<ProgressRing progress={0.75} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('displays percentage text', () => {
    render(<ProgressRing progress={0.75} />);
    expect(screen.getByText('75%')).toBeTruthy();
  });

  it('handles 0% progress', () => {
    render(<ProgressRing progress={0} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('handles 100% progress', () => {
    render(<ProgressRing progress={1} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('accepts custom size', () => {
    const { container } = render(<ProgressRing progress={0.5} size={80} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');
  });
});

// ── GoalProgress ─────────────────────────────────────
// Sin hora de fin de turno (2026-10-21): la meta se expresa como hora estimada
// al ritmo actual; no hay proyección «a fin de día» ni semáforo adelantado/atrasado.
import GoalProgress from './GoalProgress';

describe('GoalProgress', () => {
  const defaultProps = {
    progress: 65,
    currentTons: 6.5,
    targetTons: 10,
    eta: '3:30 PM',
    etaStatus: 'projected' as const,
  };

  it('renders Daily Target label', () => {
    render(<GoalProgress {...defaultProps} />);
    expect(screen.getByText('Daily Target')).toBeTruthy();
  });

  it('shows progress percentage', () => {
    render(<GoalProgress {...defaultProps} />);
    expect(screen.getByText(/65%/)).toBeTruthy();
  });

  it('shows tons progress', () => {
    render(<GoalProgress {...defaultProps} />);
    expect(screen.getByText('6.5 / 10 t')).toBeTruthy();
  });

  it('shows the goal time at the current pace, without an ETA-vs-shift-end label', () => {
    render(<GoalProgress {...defaultProps} />);
    expect(screen.getByText('At this pace: 3:30 PM')).toBeTruthy();
    expect(screen.queryByText(/ETA:/)).toBeNull();
    // Sin semáforo adelantado/atrasado: ni cohete ni aviso
    expect(screen.queryByText('rocket_launch')).toBeNull();
    expect(screen.queryByText('warning')).toBeNull();
  });

  it('shows pace and buckets left to the goal when hoursElapsed > 0.5', () => {
    render(<GoalProgress {...defaultProps} hoursElapsed={4} totalBuckets={200} velocity={50} />);
    expect(screen.getByText('Pace: 50 buckets/h')).toBeTruthy();
    // 10 t × 72 = 720 cubetas de meta − 200 = 520
    expect(screen.getByText('520 buckets to goal')).toBeTruthy();
    expect(screen.queryByText(/Projected end-of-day/)).toBeNull();
  });

  it('hides the pace row when hoursElapsed <= 0.5', () => {
    render(<GoalProgress {...defaultProps} hoursElapsed={0.3} />);
    expect(screen.queryByText(/Pace:/)).toBeNull();
    expect(screen.queryByText(/buckets to goal/)).toBeNull();
  });

  it('hides the pace row once the goal is complete', () => {
    render(<GoalProgress {...defaultProps} etaStatus="complete" eta="Complete!" progress={100} hoursElapsed={4} />);
    expect(screen.getByText('Complete!')).toBeTruthy();
    expect(screen.queryByText(/Pace:/)).toBeNull();
  });
});
