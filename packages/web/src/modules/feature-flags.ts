// =============================================================================
// AETHER SDK — FEATURE FLAGS MODULE
// Client-side feature flag evaluation with remote config and local overrides
// =============================================================================

import { storage, now } from '../utils';
import type { FeatureFlag, FlagDefinition } from '../../../shared/feature-flag-types';
export type { FeatureFlag, FlagDefinition };

export interface FeatureFlagCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
  onFlagEvaluated?: (flag: FeatureFlag) => void;
}

export interface FeatureFlagConfig {
  endpoint: string;
  apiKey: string;
  refreshIntervalMs?: number;
  cacheKey?: string;
  defaults?: Record<string, boolean | unknown>;
  overrides?: Record<string, boolean | unknown>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_REFRESH_INTERVAL = 300_000; // 5 minutes
const DEFAULT_CACHE_KEY = 'flags';
const OVERRIDES_KEY = 'flag_overrides';

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface RemoteFlagData {
  key: string;
  enabled: boolean;
  value?: unknown;
  variant?: string;
}

type FlagChangeCallback = (flag: FeatureFlag) => void;

// =============================================================================
// MODULE
// =============================================================================

export class FeatureFlagModule {
  private callbacks: FeatureFlagCallbacks;
  private config: FeatureFlagConfig | null = null;
  private remoteFlags: Map<string, RemoteFlagData> = new Map();
  private overrides: Map<string, boolean | unknown> = new Map();
  private defaults: Map<string, boolean | unknown> = new Map();
  private changeListeners: Map<string, Set<FlagChangeCallback>> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private cacheKey: string = DEFAULT_CACHE_KEY;
  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(callbacks: FeatureFlagCallbacks) {
    this.callbacks = callbacks;
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /** Initialize the feature flags module: load cached flags, start remote sync */
  async init(config: FeatureFlagConfig): Promise<void> {
    this.config = config;
    this.cacheKey = config.cacheKey ?? DEFAULT_CACHE_KEY;

    // Load defaults
    if (config.defaults) {
      Object.entries(config.defaults).forEach(([key, value]) => {
        this.defaults.set(key, value);
      });
    }

    // Load persisted overrides
    const storedOverrides = storage.get<Record<string, boolean | unknown>>(OVERRIDES_KEY);
    if (storedOverrides) {
      Object.entries(storedOverrides).forEach(([key, value]) => {
        this.overrides.set(key, value);
      });
    }

    // Apply config overrides (take precedence over stored)
    if (config.overrides) {
      Object.entries(config.overrides).forEach(([key, value]) => {
        this.overrides.set(key, value);
      });
      this.persistOverrides();
    }

    // Load cached remote flags (stale-while-revalidate)
    this.loadCachedFlags();

    // Fetch remote flags in background
    await this.refresh().catch(() => {
      // Silently fail — stale cache or defaults will be used
    });

    // Start periodic refresh
    const interval = config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL;
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => { /* silent */ });
    }, interval);
  }

  // ===========================================================================
  // FLAG EVALUATION
  // ===========================================================================

  /** Simple boolean check for a feature flag */
  isEnabled(key: string): boolean {
    const flag = this.evaluateFlag(key);
    this.trackEvaluation(flag);
    return flag.enabled;
  }

  /** Get the full flag object with metadata */
  getFlag(key: string): FeatureFlag {
    const flag = this.evaluateFlag(key);
    this.trackEvaluation(flag);
    return flag;
  }

  /** Get a typed value for multivariate flags */
  getValue<T>(key: string, defaultValue: T): T {
    const flag = this.evaluateFlag(key);
    this.trackEvaluation(flag);

    if (flag.value !== undefined && flag.value !== null) {
      return flag.value as T;
    }
    return defaultValue;
  }

  /** Get all currently evaluated flags */
  getAllFlags(): Record<string, FeatureFlag> {
    const result: Record<string, FeatureFlag> = {};

    // Merge all known keys
    const allKeys = new Set<string>();
    this.defaults.forEach((_, key) => allKeys.add(key));
    this.remoteFlags.forEach((_, key) => allKeys.add(key));
    this.overrides.forEach((_, key) => allKeys.add(key));

    allKeys.forEach((key) => {
      result[key] = this.evaluateFlag(key);
    });

    return result;
  }

  // ===========================================================================
  // OVERRIDES (DEV / TESTING)
  // ===========================================================================

  /** Set a local override for a flag (takes highest priority) */
  setOverride(key: string, value: boolean | unknown): void {
    const previousFlag = this.evaluateFlag(key);
    this.overrides.set(key, value);
    this.persistOverrides();

    const newFlag = this.evaluateFlag(key);
    this.notifyChange(key, previousFlag, newFlag);
  }

  /** Remove a single override */
  clearOverride(key: string): void {
    const previousFlag = this.evaluateFlag(key);
    this.overrides.delete(key);
    this.persistOverrides();

    const newFlag = this.evaluateFlag(key);
    this.notifyChange(key, previousFlag, newFlag);
  }

  /** Remove all overrides */
  clearAllOverrides(): void {
    const previousFlags = new Map<string, FeatureFlag>();
    this.overrides.forEach((_, key) => {
      previousFlags.set(key, this.evaluateFlag(key));
    });

    this.overrides.clear();
    this.persistOverrides();

    previousFlags.forEach((prev, key) => {
      const newFlag = this.evaluateFlag(key);
      this.notifyChange(key, prev, newFlag);
    });
  }

  // ===========================================================================
  // REMOTE SYNC
  // ===========================================================================

  /** Force a remote refresh of feature flags */
  async refresh(): Promise<void> {
    if (!this.config) return;

    const response = await fetch(this.config.endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Feature flag fetch failed: ${response.status}`);
    }

    const data = await response.json() as { flags?: RemoteFlagData[] };
    const flags = data.flags ?? [];

    // Detect changes before updating
    const previousFlags = new Map<string, FeatureFlag>();
    this.remoteFlags.forEach((_, key) => {
      previousFlags.set(key, this.evaluateFlag(key));
    });

    // Update remote flags
    this.remoteFlags.clear();
    for (const flag of flags) {
      this.remoteFlags.set(flag.key, flag);
    }

    // Cache updated flags
    this.cacheFlags();

    // Notify listeners of changes
    this.remoteFlags.forEach((_, key) => {
      const prev = previousFlags.get(key);
      const current = this.evaluateFlag(key);
      if (prev) {
        this.notifyChange(key, prev, current);
      }
    });
  }

  // ===========================================================================
  // CHANGE WATCHING
  // ===========================================================================

  /** Watch a specific flag for changes. Returns an unsubscribe function. */
  onFlagChange(key: string, callback: FlagChangeCallback): () => void {
    let listeners = this.changeListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.changeListeners.set(key, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.changeListeners.delete(key);
      }
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /** Stop refresh timer and clean up */
  destroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];

    this.changeListeners.clear();
  }

  // ===========================================================================
  // PRIVATE — EVALUATION
  // ===========================================================================

  /**
   * Evaluate a flag using priority chain: overrides > remote > defaults
   */
  private evaluateFlag(key: string): FeatureFlag {
    // 1. Check overrides (highest priority)
    if (this.overrides.has(key)) {
      const value = this.overrides.get(key);
      return {
        key,
        enabled: typeof value === 'boolean' ? value : !!value,
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

    // 3. Check defaults
    if (this.defaults.has(key)) {
      const value = this.defaults.get(key);
      return {
        key,
        enabled: typeof value === 'boolean' ? value : !!value,
        value: typeof value === 'boolean' ? undefined : value,
        source: 'default',
      };
    }

    // 4. Unknown flag — disabled by default
    return {
      key,
      enabled: false,
      source: 'default',
    };
  }

  // ===========================================================================
  // PRIVATE — TRACKING & NOTIFICATIONS
  // ===========================================================================

  private trackEvaluation(flag: FeatureFlag): void {
    this.callbacks.onTrack('feature_flag_evaluated', {
      key: flag.key,
      enabled: flag.enabled,
      value: flag.value ?? null,
      variant: flag.variant ?? null,
      source: flag.source,
      evaluatedAt: now(),
    });

    this.callbacks.onFlagEvaluated?.(flag);
  }

  private notifyChange(key: string, previous: FeatureFlag, current: FeatureFlag): void {
    // Only notify if there is an actual change
    if (
      previous.enabled === current.enabled &&
      previous.value === current.value &&
      previous.source === current.source
    ) {
      return;
    }

    const listeners = this.changeListeners.get(key);
    if (listeners) {
      listeners.forEach((cb) => cb(current));
    }
  }

  // ===========================================================================
  // PRIVATE — CACHING
  // ===========================================================================

  private loadCachedFlags(): void {
    const cached = storage.get<RemoteFlagData[]>(this.cacheKey);
    if (Array.isArray(cached)) {
      for (const flag of cached) {
        this.remoteFlags.set(flag.key, flag);
      }
    }
  }

  private cacheFlags(): void {
    const flags: RemoteFlagData[] = [];
    this.remoteFlags.forEach((flag) => flags.push(flag));
    storage.set(this.cacheKey, flags);
  }

  private persistOverrides(): void {
    const obj: Record<string, boolean | unknown> = {};
    this.overrides.forEach((value, key) => {
      obj[key] = value;
    });
    storage.set(OVERRIDES_KEY, obj);
  }
}
