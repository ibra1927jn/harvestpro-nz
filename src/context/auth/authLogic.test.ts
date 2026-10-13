import { describe, it, expect } from 'vitest';
import { Role } from '@/types';
import {
  INITIAL_AUTH_STATE,
  WHITELIST_ERRORS,
  decideAuthChange,
  needsPrivacyConsent,
  normalizeEmail,
  orchardNameFor,
  pendingSignOutMessage,
  resolveWhitelistRegistration,
  shouldRefreshOnVisible,
  VISIBILITY_REFRESH_COOLDOWN_MS,
} from './authLogic';

const invite = { id: 'r1', role: 'team_leader', orchard_id: 'o1', used_at: null };

describe('resolveWhitelistRegistration', () => {
  it('devuelve rol y huerto de una invitación válida', () => {
    expect(resolveWhitelistRegistration(invite, null)).toEqual({
      registrationId: 'r1',
      role: Role.TEAM_LEADER,
      orchardId: 'o1',
    });
  });

  it('un fallo de consulta gana aunque haya fila', () => {
    expect(() => resolveWhitelistRegistration(invite, { message: 'x' })).toThrow(
      WHITELIST_ERRORS.lookupFailed
    );
  });

  it('sin invitación: no autorizado', () => {
    expect(() => resolveWhitelistRegistration(null, null)).toThrow(WHITELIST_ERRORS.notAuthorized);
  });

  it('invitación ya usada: rechaza', () => {
    expect(() =>
      resolveWhitelistRegistration({ ...invite, used_at: '2026-01-01' }, null)
    ).toThrow(WHITELIST_ERRORS.alreadyUsed);
  });
});

describe('decideAuthChange', () => {
  it('TOKEN_REFRESHED nunca recarga ni cierra sesión', () => {
    expect(decideAuthChange('TOKEN_REFRESHED', true, true, false)).toBe('ignore');
    expect(decideAuthChange('TOKEN_REFRESHED', false, false, true)).toBe('ignore');
  });

  it('sesión con usuario y aún no autenticado: cargar perfil', () => {
    expect(decideAuthChange('SIGNED_IN', true, true, false)).toBe('load-session-user');
    expect(decideAuthChange('INITIAL_SESSION', true, true, false)).toBe('load-session-user');
  });

  it('ya autenticado con sesión: no recargar (evita doble carga)', () => {
    expect(decideAuthChange('SIGNED_IN', true, true, true)).toBe('ignore');
  });

  it('sin sesión estando autenticado: sesión perdida', () => {
    expect(decideAuthChange('SIGNED_OUT', false, false, true)).toBe('session-lost');
  });

  it('sin sesión y sin autenticar: nada', () => {
    expect(decideAuthChange('SIGNED_OUT', false, false, false)).toBe('ignore');
  });
});

describe('shouldRefreshOnVisible', () => {
  const now = 1_000_000;
  it('refresca al volver si pasó el enfriamiento', () => {
    expect(shouldRefreshOnVisible(true, true, now, now - VISIBILITY_REFRESH_COOLDOWN_MS - 1)).toBe(true);
  });
  it('no refresca dentro del enfriamiento (límite exacto incluido)', () => {
    expect(shouldRefreshOnVisible(true, true, now, now - VISIBILITY_REFRESH_COOLDOWN_MS)).toBe(false);
  });
  it('no refresca oculto ni sin red', () => {
    expect(shouldRefreshOnVisible(false, true, now, 0)).toBe(false);
    expect(shouldRefreshOnVisible(true, false, now, 0)).toBe(false);
  });
});

describe('helpers', () => {
  it('needsPrivacyConsent solo con perfil sin fecha de consentimiento', () => {
    expect(needsPrivacyConsent(null)).toBe(false);
    expect(needsPrivacyConsent({ privacy_consent_at: '2026-01-01' })).toBe(false);
    expect(needsPrivacyConsent({ privacy_consent_at: null })).toBe(true);
    expect(needsPrivacyConsent({})).toBe(true);
  });

  it('orchardNameFor busca por id y devuelve vacío si no está', () => {
    const list = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
    expect(orchardNameFor(list, 'b')).toBe('Beta');
    expect(orchardNameFor(list, 'z')).toBe('');
    expect(orchardNameFor(list, null)).toBe('');
  });

  it('normalizeEmail recorta y pasa a minúsculas', () => {
    expect(normalizeEmail('  Ana@Farm.NZ ')).toBe('ana@farm.nz');
  });

  it('el mensaje de cierre con pendientes incluye el número', () => {
    expect(pendingSignOutMessage(7)).toContain('Tienes 7 registros sin sincronizar');
  });

  it('el estado inicial arranca cargando y sin sesión', () => {
    expect(INITIAL_AUTH_STATE.isLoading).toBe(true);
    expect(INITIAL_AUTH_STATE.isAuthenticated).toBe(false);
    expect(INITIAL_AUTH_STATE.user).toBeNull();
  });
});
