import { describe, it, expect, vi } from 'vitest';

const nativeEcom = {
  initialize: vi.fn(),
  trackProductView: vi.fn(),
  trackAddToCart: vi.fn(),
  trackCheckout: vi.fn(),
  trackPurchase: vi.fn(),
};

vi.mock('react-native', () => ({
  NativeModules: { AetherEcommerce: nativeEcom },
  NativeEventEmitter: class {},
  Platform: { OS: 'ios' },
}));

describe('RNEcommerce (RN thin bridge) — module loads', () => {
  it('module can be imported without throwing when NativeModules are present', async () => {
    const mod = await import('../modules/Ecommerce');
    expect(mod).toBeDefined();
  });

  it('module can be imported when the native side is missing (null-safe)', async () => {
    vi.resetModules();
    vi.doMock('react-native', () => ({
      NativeModules: {},
      NativeEventEmitter: class {},
      Platform: { OS: 'android' },
    }));
    const mod = await import('../modules/Ecommerce');
    expect(mod).toBeDefined();
  });
});
