// =============================================
// NOTIFICATION SERVICE TESTS
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  }),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// Mock Notification API
const mockNotification = vi.fn();
Object.defineProperty(global, 'Notification', {
  value: mockNotification,
  writable: true,
  configurable: true,
});
Object.defineProperty(mockNotification, 'permission', {
  value: 'granted',
  writable: true,
  configurable: true,
});
Object.defineProperty(mockNotification, 'requestPermission', {
  value: vi.fn().mockResolvedValue('granted'),
  writable: true,
});

// Must import after mocks are set up
import { notificationService } from '../notification.service';

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    notificationService.stopChecking();
  });

  // =============================================
  // PREFERENCES
  // =============================================
  describe('getPrefs', () => {
    it('should return default prefs when nothing stored', () => {
      const prefs = notificationService.getPrefs();
      expect(prefs.enabled).toBe(false);
      expect(prefs.types.visa_expiry).toBe(true);
      expect(prefs.types.qc_reject).toBe(true);
      expect(prefs.types.transport).toBe(true);
      expect(prefs.types.attendance).toBe(true);
    });

    it('should return stored prefs when available', () => {
      const storedPrefs = {
        enabled: true,
        types: { visa_expiry: false, qc_reject: true, transport: false, attendance: true },
      };
      mockStorage['harvestpro_notification_prefs'] = JSON.stringify(storedPrefs);
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedPrefs));

      const prefs = notificationService.getPrefs();
      expect(prefs.enabled).toBe(true);
      expect(prefs.types.visa_expiry).toBe(false);
    });

    it('should return defaults on corrupted JSON', () => {
      localStorageMock.getItem.mockReturnValueOnce('NOT_JSON!!!');
      const prefs = notificationService.getPrefs();
      expect(prefs.enabled).toBe(false);
      expect(prefs.types).toBeDefined();
    });
  });

  // =============================================
  // ALERT TYPE MANAGEMENT
  // =============================================
  describe('setAlertTypes', () => {
    it('should update specific alert types', () => {
      notificationService.setAlertTypes({ visa_expiry: false });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedValue = localStorageMock.setItem.mock.calls[0][1];
      const parsed = JSON.parse(savedValue);
      expect(parsed.types.visa_expiry).toBe(false);
      // Other types should remain default
      expect(parsed.types.qc_reject).toBe(true);
    });
  });

  // =============================================
  // SEND NOTIFICATION
  // =============================================
  describe('sendNotification', () => {
    it('should create a Notification when permission granted', () => {
      mockNotification.mockImplementation(function (this: object) {
        return this;
      });
      Object.defineProperty(mockNotification, 'permission', { value: 'granted', writable: true });

      const _result = notificationService.sendNotification('Test', 'Body');
      // Either returns a Notification object or null
      expect(mockNotification).toHaveBeenCalledWith('Test', expect.any(Object));
    });
  });

  // =============================================
  // PERIODIC CHECKING
  // =============================================
  describe('startChecking / stopChecking', () => {
    it('should not throw when starting and stopping', () => {
      expect(() => notificationService.startChecking()).not.toThrow();
      expect(() => notificationService.stopChecking()).not.toThrow();
    });

    it('should handle multiple stop calls gracefully', () => {
      expect(() => {
        notificationService.stopChecking();
        notificationService.stopChecking();
      }).not.toThrow();
    });
  });

  // =============================================
  // TEST NOTIFICATION
  // =============================================
  describe('sendTest', () => {
    it('should call sendNotification with test content', () => {
      mockNotification.mockImplementation(function (this: object) {
        return this;
      });
      Object.defineProperty(mockNotification, 'permission', { value: 'granted', writable: true });

      notificationService.sendTest();
      expect(mockNotification).toHaveBeenCalledWith(
        expect.stringContaining('Test'),
        expect.objectContaining({ tag: 'test' })
      );
    });
  });
});

