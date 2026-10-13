/**
 * Smoke tests for OnboardingPage — multi-step wizard rendering
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/services/onboarding.service', () => ({
  onboardingService: {
    provision: vi.fn().mockResolvedValue({ orchardId: 'o1', userId: 'u1' }),
  },
}));

import { OnboardingPage } from './OnboardingPage';

describe('OnboardingPage', () => {
  it('renders step 1 — organisation details', () => {
    render(<OnboardingPage />);
    // Step 1 should show orchard name field
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders without crashing', () => {
    const { container } = render(<OnboardingPage />);
    expect(container.firstChild).not.toBeNull();
  });

  it('has a next/submit button', () => {
    render(<OnboardingPage />);
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
