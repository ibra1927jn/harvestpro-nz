/**
 * GoalProgress — Deep render tests
 *
 * Sin hora de fin de turno (2026-10-21): la meta se expresa como hora estimada
 * al ritmo actual; no hay proyección «a fin de día» ni semáforo adelantado/atrasado.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import GoalProgress from './GoalProgress';

describe('GoalProgress', () => {
    const defaultProps = {
        progress: 65,
        currentTons: 4.2,
        targetTons: 6.5,
        eta: '14:30',
        etaStatus: 'projected' as const,
        velocity: 75,
        totalBuckets: 302,
        hoursElapsed: 4,
    };

    it('renders Daily Target label', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText('Daily Target')).toBeTruthy();
    });

    it('renders progress percentage', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText(/65%/)).toBeTruthy();
    });

    it('renders Complete label', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText('Complete')).toBeTruthy();
    });

    it('renders tons progress', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText('4.2 / 6.5 t')).toBeTruthy();
    });

    it('renders the goal time at the current pace (no shift end, no traffic light)', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText('At this pace: 14:30')).toBeTruthy();
        expect(screen.queryByText(/ETA:/)).toBeNull();
        expect(screen.queryByText('rocket_launch')).toBeNull();
        expect(screen.queryByText('warning')).toBeNull();
    });

    it('shows pace and buckets remaining to the goal when hours > 0.5', () => {
        render(<GoalProgress {...defaultProps} />);
        expect(screen.getByText('Pace: 75 buckets/h')).toBeTruthy();
        // 6.5 t × 72 = 468 cubetas de meta − 302 = 166
        expect(screen.getByText('166 buckets to goal')).toBeTruthy();
        expect(screen.queryByText(/Projected end-of-day/)).toBeNull();
    });

    it('does not show pace row when hoursElapsed < 0.5', () => {
        render(<GoalProgress {...defaultProps} hoursElapsed={0.3} />);
        expect(screen.queryByText(/Pace:/)).toBeNull();
    });

    it('complete: green check and no pace row', () => {
        render(<GoalProgress {...defaultProps} etaStatus="complete" eta="Complete!" progress={100} />);
        expect(screen.getByText('check_circle')).toBeTruthy();
        expect(screen.getByText('Complete!')).toBeTruthy();
        expect(screen.queryByText(/Pace:/)).toBeNull();
    });

    it('no_data: shows the awaiting text without a time', () => {
        render(<GoalProgress {...defaultProps} etaStatus="no_data" eta="Awaiting data..." />);
        expect(screen.getByText('Awaiting data...')).toBeTruthy();
        expect(screen.getByText('hourglass_empty')).toBeTruthy();
    });
});
