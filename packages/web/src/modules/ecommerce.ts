// =============================================================================
// AETHER SDK — E-COMMERCE MODULE
// Revenue tracking: product views, cart, checkout funnel, purchases, refunds
// =============================================================================

import { storage, now } from '../utils';
import type { Product, CartItem, Order } from '../../../shared/ecommerce-types';
export type { Product, CartItem, Order };

export interface EcommerceCallbacks {
  onTrack: (event: string, properties: Record<string, unknown>) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CART_STORAGE_KEY = 'cart';

// =============================================================================
// MODULE
// =============================================================================

export class EcommerceModule {
  private callbacks: EcommerceCallbacks;
  private cart: Map<string, CartItem>;
  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(callbacks: EcommerceCallbacks) {
    this.callbacks = callbacks;
    this.cart = this.loadCart();
  }

  // ===========================================================================
  // PRODUCT TRACKING
  // ===========================================================================

  /** Track a single product view/impression */
  productViewed(product: Product): void {
    this.callbacks.onTrack('product_viewed', {
      ...this.serializeProduct(product),
      viewedAt: now(),
    });
  }

  /** Track a product list view (e.g. category page, search results) */
  productListViewed(listId: string, products: Product[]): void {
    this.callbacks.onTrack('product_list_viewed', {
      listId,
      products: products.map((p, i) => this.serializeProduct(p, i)),
      productCount: products.length,
      viewedAt: now(),
    });
  }

  /** Track a product click from a list */
  productClicked(product: Product, listId?: string): void {
    this.callbacks.onTrack('product_clicked', {
      ...this.serializeProduct(product),
      listId: listId ?? null,
      clickedAt: now(),
    });
  }

  // ===========================================================================
  // CART MANAGEMENT
  // ===========================================================================

  /** Add a product to the internal cart and track the event */
  addToCart(product: Product): void {
    const existing = this.cart.get(product.id);
    const quantity = product.quantity ?? 1;

    if (existing) {
      existing.quantity += quantity;
      existing.price = product.price; // update price in case it changed
    } else {
      this.cart.set(product.id, {
        ...product,
        quantity,
      });
    }

    this.persistCart();

    this.callbacks.onTrack('product_added', {
      ...this.serializeProduct(product),
      quantity,
      cartSize: this.cart.size,
      cartValue: this.getCartValue(),
      addedAt: now(),
    });
  }

  /** Remove a product from the cart and track the event */
  removeFromCart(productId: string): void {
    const item = this.cart.get(productId);
    if (!item) return;

    this.cart.delete(productId);
    this.persistCart();

    this.callbacks.onTrack('product_removed', {
      ...this.serializeProduct(item),
      cartSize: this.cart.size,
      cartValue: this.getCartValue(),
      removedAt: now(),
    });
  }

  /** Track a cart view event with all current items */
  cartViewed(): void {
    const items = this.getCart();
    this.callbacks.onTrack('cart_viewed', {
      products: items.map((item) => this.serializeProduct(item)),
      cartSize: items.length,
      cartValue: this.getCartValue(),
      viewedAt: now(),
    });
  }

  /** Get all items currently in the cart */
  getCart(): CartItem[] {
    return Array.from(this.cart.values());
  }

  /** Clear the entire cart */
  clearCart(): void {
    this.cart.clear();
    this.persistCart();
  }

  /** Calculate the total monetary value of the cart */
  getCartValue(): number {
    let total = 0;
    this.cart.forEach((item) => {
      total += item.price * item.quantity;
    });
    return Math.round(total * 100) / 100;
  }

  // ===========================================================================
  // CHECKOUT FUNNEL
  // ===========================================================================

  /** Track checkout initiation with a snapshot of the cart */
  checkoutStarted(properties?: Record<string, unknown>): void {
    const items = this.getCart();
    this.callbacks.onTrack('checkout_started', {
      products: items.map((item) => this.serializeProduct(item)),
      cartSize: items.length,
      cartValue: this.getCartValue(),
      ...properties,
      startedAt: now(),
    });
  }

  /** Track a step in the checkout funnel */
  checkoutStepCompleted(step: number, properties?: Record<string, unknown>): void {
    this.callbacks.onTrack('checkout_step_completed', {
      step,
      cartValue: this.getCartValue(),
      ...properties,
      completedAt: now(),
    });
  }

  // ===========================================================================
  // ORDER TRACKING
  // ===========================================================================

  /** Track a completed purchase with full order data */
  orderCompleted(order: Order): void {
    const { orderId, revenue, tax, shipping, discount, coupon, currency, products, ...rest } = order;

    this.callbacks.onTrack('order_completed', {
      orderId,
      revenue,
      tax: tax ?? 0,
      shipping: shipping ?? 0,
      discount: discount ?? 0,
      coupon: coupon ?? null,
      currency: currency ?? 'USD',
      products: products.map((p) => this.serializeProduct(p)),
      productCount: products.length,
      ...rest,
      completedAt: now(),
    });

    // Clear cart on successful order
    this.clearCart();
  }

  /** Track an order refund (full or partial) */
  orderRefunded(orderId: string, products?: Product[]): void {
    const props: Record<string, unknown> = {
      orderId,
      fullRefund: !products || products.length === 0,
      refundedAt: now(),
    };

    if (products && products.length > 0) {
      props.products = products.map((p) => this.serializeProduct(p));
      props.refundValue = products.reduce(
        (sum, p) => sum + p.price * (p.quantity ?? 1),
        0
      );
    }

    this.callbacks.onTrack('order_refunded', props);
  }

  // ===========================================================================
  // COUPON TRACKING
  // ===========================================================================

  /** Track a successfully applied coupon */
  couponApplied(coupon: string, discount?: number): void {
    this.callbacks.onTrack('coupon_applied', {
      coupon,
      discount: discount ?? null,
      cartValue: this.getCartValue(),
      appliedAt: now(),
    });
  }

  /** Track a coupon that was denied/invalid */
  couponDenied(coupon: string, reason?: string): void {
    this.callbacks.onTrack('coupon_denied', {
      coupon,
      reason: reason ?? null,
      cartValue: this.getCartValue(),
      deniedAt: now(),
    });
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /** Clean up resources */
  destroy(): void {
    this.listeners.forEach(([target, event, handler]) => {
      target.removeEventListener(event, handler);
    });
    this.listeners = [];
    this.persistCart();
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /** Normalize a product into a clean serializable object */
  private serializeProduct(
    product: Product,
    positionOverride?: number
  ): Record<string, unknown> {
    return {
      productId: product.id,
      name: product.name,
      category: product.category ?? null,
      brand: product.brand ?? null,
      variant: product.variant ?? null,
      price: product.price,
      quantity: product.quantity ?? 1,
      currency: product.currency ?? 'USD',
      position: positionOverride ?? product.position ?? null,
      coupon: product.coupon ?? null,
    };
  }

  /** Load cart state from localStorage */
  private loadCart(): Map<string, CartItem> {
    const stored = storage.get<Record<string, CartItem>>(CART_STORAGE_KEY);
    if (stored && typeof stored === 'object') {
      return new Map(Object.entries(stored));
    }
    return new Map();
  }

  /** Persist cart state to localStorage */
  private persistCart(): void {
    const obj: Record<string, CartItem> = {};
    this.cart.forEach((item, key) => {
      obj[key] = item;
    });
    storage.set(CART_STORAGE_KEY, obj);
  }
}
