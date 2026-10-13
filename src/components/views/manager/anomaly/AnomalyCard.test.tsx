/**
 * AnomalyCard — Deep render tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../../services/fraud-detection.service', () => ({
    // just types needed
}));

vi.mock('./anomaly.constants', () => ({
    ANOMALY_CONFIG: {
        velocity_spike: { icon: 'speed', color: 'text-amber-600', bg: 'bg-amber-50' },
        location_anomaly: { icon: 'location_off', color: 'text-red-600', bg: 'bg-red-50' },
    },
    SEVERITY_STYLES: {
        high: 'text-red-700 bg-red-50 border-red-200',
        medium: 'text-amber-700 bg-amber-50 border-amber-200',
        low: 'text-green-700 bg-green-50 border-green-200',
    },
    RULE_BADGE: {
        elapsed_velocity: { label: 'Velocity Check', color: 'text-amber-600 bg-amber-50' },
        location_check: { label: 'Location Check', color: 'text-red-600 bg-red-50' },
    },
}));

import AnomalyCard from './AnomalyCard';

const anomaly = {
    id: 'a1',
    pickerId: 'p1',
    pickerName: 'John Doe',
    type: 'velocity_spike' as const,
    severity: 'high' as const,
    detail: 'Scanned 15 buckets in 5 minutes',
    rule: 'elapsed_velocity' as const,
    timestamp: '2026-03-10T09:30:00Z',
    evidence: {
        bucketsPerMinute: 3,
        averageBPM: 0.8,
    },
} as any;

describe('AnomalyCard', () => {
    const onViewProfile = vi.fn();

    it('renders picker name', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText('John Doe')).toBeTruthy();
    });

    it('renders severity badge', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText(/^high risk$/i)).toBeTruthy();
    });

    it('renders detail text', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText('Scanned 15 buckets in 5 minutes')).toBeTruthy();
    });

    it('renders rule badge', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText('Velocity Check')).toBeTruthy();
    });

    it('renders Inspect Profile link', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText('Inspect Profile & History')).toBeTruthy();
    });

    it('calls onViewProfile when clicked', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        fireEvent.click(screen.getByText('John Doe'));
        expect(onViewProfile).toHaveBeenCalledWith('p1');
    });

    it('renders evidence pills', () => {
        render(<AnomalyCard anomaly={anomaly} index={0} onViewProfile={onViewProfile} />);
        expect(screen.getByText(/buckets per minute: 3/)).toBeTruthy();
    });
});
