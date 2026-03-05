// =============================================================================
// AETHER SDK — HEATMAP MODULE
// Click, scroll, mouse movement, and attention heatmap data collection
// =============================================================================

import { throttle, now } from '../utils';

// =============================================================================
// TYPES
// =============================================================================

export interface HeatmapPoint {
  x: number;
  y: number;
  value: number;
  selector?: string;
  timestamp: number;
}

export interface HeatmapConfig {
  clicks?: boolean;
  movement?: boolean;
  scroll?: boolean;
  attention?: boolean;
  sampleRate?: number;
  flushIntervalMs?: number;
  gridSize?: number;
}

export interface HeatmapCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_FLUSH_INTERVAL = 30_000; // 30 seconds
const DEFAULT_GRID_SIZE = 50;
const DEFAULT_MOVEMENT_SAMPLE_RATE = 0.1;

// =============================================================================
// MODULE
// =============================================================================

export class HeatmapModule {
  private callbacks: HeatmapCallbacks;
  private config: Required<HeatmapConfig>;
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private observers: IntersectionObserver[] = [];

  // Data buffers keyed by page path
  private clickData: Map<string, HeatmapPoint[]> = new Map();
  private movementData: Map<string, HeatmapPoint[]> = new Map();
  private scrollData: Map<string, HeatmapPoint[]> = new Map();
  private attentionData: Map<string, HeatmapPoint[]> = new Map();

  // Attention tracking state
  private attentionTimers: Map<Element, number> = new Map();
  private attentionStartTimes: Map<Element, number> = new Map();

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: HeatmapCallbacks, config: HeatmapConfig = {}) {
    this.callbacks = callbacks;
    this.config = {
      clicks: config.clicks ?? true,
      movement: config.movement ?? false,
      scroll: config.scroll ?? true,
      attention: config.attention ?? true,
      sampleRate: config.sampleRate ?? DEFAULT_MOVEMENT_SAMPLE_RATE,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL,
      gridSize: config.gridSize ?? DEFAULT_GRID_SIZE,
    };
  }

  /** Start all configured heatmap tracking */
  start(): void {
    if (typeof window === 'undefined') return;

    if (this.config.clicks) this.trackClicks();
    if (this.config.movement) this.trackMovement();
    if (this.config.scroll) this.trackScroll();
    if (this.config.attention) this.trackAttention();

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  /** Get collected data by type */
  getData(type: 'click' | 'movement' | 'scroll' | 'attention'): HeatmapPoint[] {
    const pagePath = this.getPagePath();
    switch (type) {
      case 'click':     return this.clickData.get(pagePath) ?? [];
      case 'movement':  return this.movementData.get(pagePath) ?? [];
      case 'scroll':    return this.scrollData.get(pagePath) ?? [];
      case 'attention': return this.attentionData.get(pagePath) ?? [];
    }
  }

  /** Stop all tracking, flush remaining data, and clean up */
  destroy(): void {
    this.flush();

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];

    this.observers.forEach((o) => o.disconnect());
    this.observers = [];

    this.attentionTimers.clear();
    this.attentionStartTimes.clear();
  }

  // ===========================================================================
  // CLICK HEATMAP
  // ===========================================================================

  private trackClicks(): void {
    const handler = (e: Event) => {
      const event = e as MouseEvent;
      const target = event.target as HTMLElement;

      const point: HeatmapPoint = {
        x: this.normalizeX(event.pageX),
        y: this.normalizeY(event.pageY),
        value: 1,
        selector: this.getSelector(target),
        timestamp: Date.now(),
      };

      this.addPoint(this.clickData, point);
    };

    document.addEventListener('click', handler, { passive: true, capture: true });
    this.listeners.push([document, 'click', handler]);
  }

  // ===========================================================================
  // MOVEMENT HEATMAP
  // ===========================================================================

  private trackMovement(): void {
    const handler = throttle((e: unknown) => {
      // Apply sample rate
      if (Math.random() > this.config.sampleRate) return;

      const event = e as MouseEvent;
      const point: HeatmapPoint = {
        x: this.normalizeX(event.pageX),
        y: this.normalizeY(event.pageY),
        value: 1,
        timestamp: Date.now(),
      };

      this.addPoint(this.movementData, point);
    }, 100);

    document.addEventListener('mousemove', handler as EventListener, { passive: true });
    this.listeners.push([document, 'mousemove', handler as EventListener]);
  }

  // ===========================================================================
  // SCROLL HEATMAP
  // ===========================================================================

  private trackScroll(): void {
    const handler = throttle(() => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      const viewportHeight = window.innerHeight;
      const scrollable = docHeight - viewportHeight;

      if (scrollable <= 0) return;

      const depth = Math.min(scrollTop / scrollable, 1);

      // Record the scroll depth as a point at the fold line
      const point: HeatmapPoint = {
        x: 0.5, // center x (scroll depth is horizontal-agnostic)
        y: depth,
        value: 1,
        timestamp: Date.now(),
      };

      this.addPoint(this.scrollData, point);
    }, 500);

    window.addEventListener('scroll', handler as EventListener, { passive: true });
    this.listeners.push([window, 'scroll', handler as EventListener]);
  }

  // ===========================================================================
  // ATTENTION HEATMAP (IntersectionObserver)
  // ===========================================================================

  private trackAttention(): void {
    // Observe major content elements
    const selectors = 'section, article, main, [data-aether-attention], .container, .content';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;

          if (entry.isIntersecting) {
            // Start attention timer
            this.attentionStartTimes.set(el, Date.now());
          } else {
            // Element left viewport — record attention time
            const startTime = this.attentionStartTimes.get(el);
            if (startTime) {
              const duration = Date.now() - startTime;
              const rect = el.getBoundingClientRect();

              const point: HeatmapPoint = {
                x: this.normalizeX(rect.left + rect.width / 2 + window.scrollX),
                y: this.normalizeY(rect.top + rect.height / 2 + window.scrollY),
                value: duration,
                selector: this.getSelector(el as HTMLElement),
                timestamp: Date.now(),
              };

              this.addPoint(this.attentionData, point);
              this.attentionStartTimes.delete(el);
            }
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );

    // Observe existing elements
    document.querySelectorAll(selectors).forEach((el) => {
      observer.observe(el);
    });

    this.observers.push(observer);
  }

  // ===========================================================================
  // DATA AGGREGATION & FLUSH
  // ===========================================================================

  /** Aggregate points into grid buckets and send */
  private flush(): void {
    const pagePath = this.getPagePath();

    const flushBuffer = (
      buffer: Map<string, HeatmapPoint[]>,
      eventName: string
    ): void => {
      const points = buffer.get(pagePath);
      if (!points || points.length === 0) return;

      // Aggregate into grid
      const aggregated = this.aggregateToGrid(points);

      this.callbacks.onTrack(eventName, {
        page: pagePath,
        points: aggregated,
        pointCount: aggregated.length,
        rawPointCount: points.length,
        gridSize: this.config.gridSize,
        flushedAt: now(),
      });

      // Clear flushed data
      buffer.set(pagePath, []);
    };

    flushBuffer(this.clickData, 'heatmap_click');
    flushBuffer(this.movementData, 'heatmap_movement');
    flushBuffer(this.scrollData, 'heatmap_scroll');

    // Flush attention — finalize any still-visible elements
    this.attentionStartTimes.forEach((startTime, el) => {
      const duration = Date.now() - startTime;
      const rect = el.getBoundingClientRect();
      const point: HeatmapPoint = {
        x: this.normalizeX(rect.left + rect.width / 2 + window.scrollX),
        y: this.normalizeY(rect.top + rect.height / 2 + window.scrollY),
        value: duration,
        selector: this.getSelector(el as HTMLElement),
        timestamp: Date.now(),
      };
      this.addPoint(this.attentionData, point);
      // Reset start time so next flush captures fresh attention
      this.attentionStartTimes.set(el, Date.now());
    });

    flushBuffer(this.attentionData, 'heatmap_attention');
  }

  /** Aggregate raw points into NxN grid buckets */
  private aggregateToGrid(points: HeatmapPoint[]): HeatmapPoint[] {
    const grid = this.config.gridSize;
    const buckets = new Map<string, HeatmapPoint>();

    for (const point of points) {
      const gx = Math.floor(point.x * grid);
      const gy = Math.floor(point.y * grid);
      const key = `${gx}:${gy}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.value += point.value;
      } else {
        buckets.set(key, {
          x: (gx + 0.5) / grid, // center of grid cell
          y: (gy + 0.5) / grid,
          value: point.value,
          timestamp: point.timestamp,
        });
      }
    }

    return Array.from(buckets.values());
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private addPoint(buffer: Map<string, HeatmapPoint[]>, point: HeatmapPoint): void {
    const pagePath = this.getPagePath();
    let points = buffer.get(pagePath);
    if (!points) {
      points = [];
      buffer.set(pagePath, points);
    }
    points.push(point);
  }

  /** Normalize X to 0-1 based on document width */
  private normalizeX(pageX: number): number {
    const docWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      window.innerWidth
    );
    return Math.min(Math.max(pageX / docWidth, 0), 1);
  }

  /** Normalize Y to 0-1 based on document height */
  private normalizeY(pageY: number): number {
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      window.innerHeight
    );
    return Math.min(Math.max(pageY / docHeight, 0), 1);
  }

  /** Get a minimal CSS selector for an element */
  private getSelector(el: HTMLElement, maxDepth = 3): string {
    const parts: string[] = [];
    let current: HTMLElement | null = el;
    let depth = 0;

    while (current && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${current.id}`);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (classes) selector += `.${classes}`;
      }
      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  private getPagePath(): string {
    return window.location.pathname;
  }
}
