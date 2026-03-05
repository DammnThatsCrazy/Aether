// =============================================================================
// AETHER SDK — FEATURE FLAGS MODULE (React Native)
// Client-side feature flag evaluation with remote config
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const FLAGS_KEY = '@aether_flags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  value?: unknown;
  variant?: string;
  source: 'remote' | 'local' | 'default' | 'override';
}

export interface FlagConfig {
  endpoint: string;
  apiKey: string;
  refreshIntervalMs?: number; // default 300_000 (5 minutes)
  defaults?: Record<string, boolean | unknown>;
  overrides?: Record<string, boolean | unknown>;
}

export type TrackCallback = (event: string, properties: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RemoteFlagPayload {
  key: string;
  enabled: boolean;
  value?: unknown;
  variant?: string;
}

interface CachedFlags {
  flags: Record<string, RemoteFlagPayload>;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REFRESH_INTERVAL_MS = 300_000; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Feature Flags Module
// ---------------------------------------------------------------------------

export class RNFeatureFlagModule {
  private remoteFlags: Map<string, RemoteFlagPayload> = new Map();
  private defaults: Map<string, boolean | unknown> = new Map();
  private overrides: Map<string, boolean | unknown> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private config: FlagConfig | null = null;
  private readonly onTrack: TrackCallback;

  constructor(onTrack: TrackCallback = () => {}) {
    this.onTrack = onTrack;
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Configure the feature flags module. Loads cached flags from AsyncStorage,
   * then starts a background refresh timer to pull remote flags.
   */
  async configure(config: FlagConfig): Promise<void> {
    this.config = config;

    // Apply defaults
    this.defaults.clear();
    if (config.defaults) {
      for (const [key, value] of Object.entries(config.defaults)) {
        this.defaults.set(key, value);
      }
    }

    // Apply overrides
    this.overrides.clear();
    if (config.overrides) {
      for (const [key, value] of Object.entries(config.overrides)) {
        this.overrides.set(key, value);
      }
    }

    // Load cached flags (stale-while-revalidate)
    await this._loadCachedFlags();

    // Refresh immediately, then on interval
    this.refresh().catch(() => {});

    this._startRefreshTimer(config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS);
  }

  // =========================================================================
  // Flag Evaluation
  // =========================================================================

  /**
   * Check whether a feature flag is enabled.
   * Priority: overrides > remote > defaults
   */
  isEnabled(key: string): boolean {
    const flag = this.getFlag(key);
    this._trackEvaluation(key, flag);
    return flag.enabled;
  }

  /**
   * Get the full FeatureFlag object for a given key.
   * Priority: overrides > remote > defaults
   */
  getFlag(key: string): FeatureFlag {
    // 1. Check overrides first
    if (this.overrides.has(key)) {
      const value = this.overrides.get(key);
      const enabled = typeof value === 'boolean' ? value : true;
      return {
        key,
        enabled,
        value: typeof value === 'boolean' ? undefined : value,
        source: 'override',
      };
    }

    // 2. Check remote flags
    const remote = this.remoteFlags.get(key);
    if (remote) {
      return {
        key,
        enabled: remote.enabled,
        value: remote.value,
        variant: remote.variant,
        source: 'remote',
      };
    }

    // 3. Fall back to defaults
    if (this.defaults.has(key)) {
      const value = this.defaults.get(key);
      const enabled = typeof value === 'boolean' ? value : true;
      return {
        key,
        enabled,
        value: typeof value === 'boolean' ? undefined : value,
        source: 'default',
      };
    }

    // 4. Unknown flag: disabled by default
    return { key, enabled: false, source: 'default' };
  }

  /**
   * Get the value of a feature flag, returning a typed default if not found.
   */
  getValue<T>(key: string, defaultValue: T): T {
    const flag = this.getFlag(key);
    this._trackEvaluation(key, flag);

    if (flag.value !== undefined && flag.value !== null) {
      return flag.value as T;
    }
    return defaultValue;
  }

  /**
   * Return all evaluated flags as a record.
   */
  getAllFlags(): Record<string, FeatureFlag> {
    const result: Record<string, FeatureFlag> = {};

    // Collect all known keys from every source
    const allKeys = new Set<string>();
    for (const key of this.defaults.keys()) allKeys.add(key);
    for (const key of this.remoteFlags.keys()) allKeys.add(key);
    for (const key of this.overrides.keys()) allKeys.add(key);

    for (const key of allKeys) {
      result[key] = this.getFlag(key);
    }

    return result;
  }

  // =========================================================================
  // Overrides
  // =========================================================================

  setOverride(key: string, value: boolean | unknown): void {
    this.overrides.set(key, value);
  }

  clearOverride(key: string): void {
    this.overrides.delete(key);
  }

  // =========================================================================
  // Remote Refresh
  // =========================================================================

  /**
   * Fetch the latest flags from the remote endpoint.
   */
  async refresh(): Promise<void> {
    if (!this.config) return;

    const { endpoint, apiKey } = this.config;
    const url = `${endpoint}/flags`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Aether-SDK': 'react-native',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching feature flags`);
      }

      const payload: RemoteFlagPayload[] = await response.json();

      this.remoteFlags.clear();
      for (const flag of payload) {
        this.remoteFlags.set(flag.key, flag);
      }

      // Persist to AsyncStorage for stale-while-revalidate
      await this._cacheFlags();
    } catch {
      // Network failures are non-critical; cached/default flags remain active.
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  destroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.remoteFlags.clear();
    this.defaults.clear();
    this.overrides.clear();
    this.config = null;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private _startRefreshTimer(intervalMs: number): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => {});
    }, intervalMs);
  }

  private async _loadCachedFlags(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(FLAGS_KEY);
      if (!raw) return;

      const cached: CachedFlags = JSON.parse(raw);
      this.remoteFlags.clear();
      for (const [key, flag] of Object.entries(cached.flags)) {
        this.remoteFlags.set(key, flag);
      }
    } catch {
      // Graceful degradation: continue without cached flags.
    }
  }

  private async _cacheFlags(): Promise<void> {
    try {
      const flags: Record<string, RemoteFlagPayload> = {};
      for (const [key, flag] of this.remoteFlags.entries()) {
        flags[key] = flag;
      }
      const cached: CachedFlags = { flags, fetchedAt: Date.now() };
      await AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(cached));
    } catch {
      // Storage failures are non-critical.
    }
  }

  private _trackEvaluation(key: string, flag: FeatureFlag): void {
    try {
      this.onTrack('Feature Flag Evaluated', {
        flag_key: key,
        flag_enabled: flag.enabled,
        flag_value: flag.value,
        flag_variant: flag.variant,
        flag_source: flag.source,
      });
    } catch {
      // Tracking failures must never break app functionality.
    }
  }
}

// ---------------------------------------------------------------------------
// Default singleton (provide your own onTrack callback before first use)
// ---------------------------------------------------------------------------

const featureFlags = new RNFeatureFlagModule();
export default featureFlags;
