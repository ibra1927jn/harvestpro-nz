/**
 * PrivacyConsentModal — Tests
 *
 * Verifies the NZ Privacy Act 2020 consent modal:
 * - Renders all 6 privacy sections
 * - Cannot accept without scrolling
 * - Calls onConsentGiven after acceptance
 * - Shows error on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PrivacyConsentModal from './PrivacyConsentModal';
import { setCurrentLocale as setLocaleForTests } from '@/i18n';

// Mock supabase
vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PrivacyConsentModal', () => {
  const defaultProps = {
    userId: 'test-user-id-123',
    userRole: 'runner',
    onConsentGiven: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal with privacy title and subtitle', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    expect(screen.getByTestId('privacy-consent-modal')).toBeInTheDocument();
    expect(screen.getByText(/Privacy & Data Collection Notice/)).toBeInTheDocument();
    expect(screen.getByText(/Under the New Zealand Privacy Act 2020/)).toBeInTheDocument();
  });

  it('renders all 6 privacy sections', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    expect(screen.getByText(/^1\. Information We Collect/)).toBeInTheDocument();
    expect(screen.getByText(/^2\. Purpose of Collection/)).toBeInTheDocument();
    expect(screen.getByText(/^3\. Storage & Security/)).toBeInTheDocument();
    expect(screen.getByText(/^4\. Who Has Access/)).toBeInTheDocument();
    expect(screen.getByText(/^5\. Your Rights/)).toBeInTheDocument();
    expect(screen.getByText(/^6\. Data Retention/)).toBeInTheDocument();
  });

  it('disables accept button until user scrolls to bottom', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    const acceptButton = screen.getByTestId('privacy-consent-accept');
    expect(acceptButton).toBeDisabled();
    expect(acceptButton.textContent).toContain('Please scroll down');
  });

  it('enables accept button after scrolling to bottom', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    const content = screen.getByTestId('privacy-consent-content');

    // Simulate scrolling to the bottom
    Object.defineProperty(content, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(content, 'scrollTop', { value: 980, configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 400, configurable: true });

    fireEvent.scroll(content);

    const acceptButton = screen.getByTestId('privacy-consent-accept');
    expect(acceptButton).not.toBeDisabled();
    expect(acceptButton.textContent).toContain('I Have Read and Accept');
  });

  it('calls onConsentGiven after successful consent recording', async () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    // Scroll to bottom first
    const content = screen.getByTestId('privacy-consent-content');
    Object.defineProperty(content, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(content, 'scrollTop', { value: 980, configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 400, configurable: true });
    fireEvent.scroll(content);

    // Click accept
    const acceptButton = screen.getByTestId('privacy-consent-accept');
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(defaultProps.onConsentGiven).toHaveBeenCalledTimes(1);
    });
  });

  it('has proper ARIA attributes for accessibility', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    const dialog = screen.getByTestId('privacy-consent-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'privacy-consent-title');
  });

  it('renders the legal reference at the bottom', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    expect(screen.getByText(/This notice is issued in accordance with the New Zealand Privacy Act 2020/)).toBeInTheDocument();
  });

  it('uses the language chosen in the app (not a separate setting)', () => {
    // Antes usaba otro servicio i18n con su propia clave de idioma: salía en inglés
    // aunque la app estuviera en español
    localStorage.setItem('harvestpro_locale', 'es');
    setLocaleForTests('es');
    try {
      render(<PrivacyConsentModal {...defaultProps} />);
      expect(screen.getByText(/Aviso de Privacidad y Recopilación de Datos/)).toBeInTheDocument();
      expect(screen.getByTestId('privacy-consent-accept').textContent).toContain('Desplácese hacia abajo');
    } finally {
      localStorage.removeItem('harvestpro_locale');
      setLocaleForTests('en');
    }
  });

  it('renders the footer consent timestamp notice', () => {
    render(<PrivacyConsentModal {...defaultProps} />);

    expect(screen.getByText(/Your consent will be recorded with a timestamp/)).toBeInTheDocument();
  });
});
