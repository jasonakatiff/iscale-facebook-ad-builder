import { describe, expect, it } from 'vitest';
import { canUseMetaConnection } from '../../frontend/src/lib/metaConnection';

describe('Meta connection capability', () => {
  it.each([null, {}, { connected: false }, { connected: true, state: 'expired' }, { connected: true, state: 'unavailable' }, { connected: true, state: 'selection_required' }])('blocks unavailable state %j', connection => {
    expect(canUseMetaConnection(connection)).toBe(false);
  });
  it('accepts usable personal, managed and legacy connected responses', () => {
    for (const source of ['oauth', 'managed', undefined]) expect(canUseMetaConnection({ connected: true, state: 'connected', source })).toBe(true);
    expect(canUseMetaConnection({ connected: true })).toBe(true);
  });
  it('blocks expired and malformed known expiry and allows future UTC expiry', () => {
    const now = Date.parse('2026-09-06T20:00:00Z');
    for (const expiry of ['2026-09-06T19:59:59Z', '2026-09-06T20:00:00Z', 'invalid']) expect(canUseMetaConnection({ connected: true, token_expires_at: expiry }, now)).toBe(false);
    expect(canUseMetaConnection({ connected: true, token_expires_at: '2026-09-07T00:00:00Z' }, now)).toBe(true);
  });
});
