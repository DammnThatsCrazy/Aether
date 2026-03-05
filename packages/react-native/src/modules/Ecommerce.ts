// =============================================================================
// AETHER SDK — E-COMMERCE MODULE (React Native)
// Revenue tracking: product views, cart, checkout funnel, purchases
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const CART_KEY = '@aether_cart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  variant?: string;
  price: number;
  quantity?: number;
  currency?: string;
  coupon?: string;
  [key: string]: unknown;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Order {
  orderId: string;
  revenue: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  coupon?: string;
  currency?: string;
  products: Product[];
  [key: string]: unknown;
}

export type TrackCallback = (event: string, properties: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// E-Commerce Module
// ---------------------------------------------------------------------------

export class RNEcommerceModule {
  private cart: Map<string, CartItem> = new Map();
  private readonly onTrack: TrackCallback;
  private initialized = false;

  constructor(onTrack: TrackCallback = () => {}) {
    this.onTrack = onTrack;
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Load persisted cart from AsyncStorage. Call this once during app startup.
   */
  async loadCart(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(CART_KEY);
      if (raw) {
        const items: CartItem[] = JSON.parse(raw);
        this.cart.clear();
        for (const item of items) {
          this.cart.set(item.id, item);
        }
      }
    } catch {
      // Graceful degradation: start with empty cart if storage read fails.
    }
    this.initialized = true;
  }

  // =========================================================================
  // Product Events
  // =========================================================================

  productViewed(product: Product): void {
    this._track('Product Viewed', {
      product_id: product.id,
      name: product.name,
      category: product.category,
      brand: product.brand,
      variant: product.variant,
      price: product.price,
      currency: product.currency ?? 'USD',
    });
  }

  productListViewed(listId: string, products: Product[]): void {
    this._track('Product List Viewed', {
      list_id: listId,
      products: products.map((p, index) => ({
        product_id: p.id,
        name: p.name,
        category: p.category,
        brand: p.brand,
        price: p.price,
        position: index + 1,
        currency: p.currency ?? 'USD',
      })),
    });
  }

  // =========================================================================
  // Cart Operations
  // =========================================================================

  async addToCart(product: Product): Promise<void> {
    const existing = this.cart.get(product.id);
    const quantity = (product.quantity ?? 1) + (existing?.quantity ?? 0);
    const cartItem: CartItem = { ...product, quantity };

    this.cart.set(product.id, cartItem);
    await this._persistCart();

    this._track('Product Added', {
      product_id: product.id,
      name: product.name,
      category: product.category,
      brand: product.brand,
      variant: product.variant,
      price: product.price,
      quantity: product.quantity ?? 1,
      currency: product.currency ?? 'USD',
      cart_size: this.cart.size,
      cart_value: this.getCartValue(),
    });
  }

  async removeFromCart(productId: string): Promise<void> {
    const item = this.cart.get(productId);
    if (!item) return;

    this.cart.delete(productId);
    await this._persistCart();

    this._track('Product Removed', {
      product_id: item.id,
      name: item.name,
      category: item.category,
      brand: item.brand,
      price: item.price,
      quantity: item.quantity,
      currency: item.currency ?? 'USD',
      cart_size: this.cart.size,
      cart_value: this.getCartValue(),
    });
  }

  cartViewed(): void {
    const items = this.getCart();
    this._track('Cart Viewed', {
      cart_size: items.length,
      cart_value: this.getCartValue(),
      products: items.map((item) => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        currency: item.currency ?? 'USD',
      })),
    });
  }

  // =========================================================================
  // Checkout Funnel
  // =========================================================================

  checkoutStarted(properties?: Record<string, unknown>): void {
    const items = this.getCart();
    this._track('Checkout Started', {
      cart_size: items.length,
      cart_value: this.getCartValue(),
      products: items.map((item) => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      ...properties,
    });
  }

  checkoutStepCompleted(step: number, properties?: Record<string, unknown>): void {
    this._track('Checkout Step Completed', {
      step,
      ...properties,
    });
  }

  // =========================================================================
  // Order Events
  // =========================================================================

  async orderCompleted(order: Order): Promise<void> {
    this._track('Order Completed', {
      order_id: order.orderId,
      revenue: order.revenue,
      tax: order.tax ?? 0,
      shipping: order.shipping ?? 0,
      discount: order.discount ?? 0,
      coupon: order.coupon,
      currency: order.currency ?? 'USD',
      products: order.products.map((p) => ({
        product_id: p.id,
        name: p.name,
        price: p.price,
        quantity: p.quantity ?? 1,
        category: p.category,
        brand: p.brand,
      })),
    });

    // Clear the cart after a successful purchase.
    await this.clearCart();
  }

  orderRefunded(orderId: string, products?: Product[]): void {
    const props: Record<string, unknown> = { order_id: orderId };
    if (products && products.length > 0) {
      props.products = products.map((p) => ({
        product_id: p.id,
        name: p.name,
        price: p.price,
        quantity: p.quantity ?? 1,
      }));
    }
    this._track('Order Refunded', props);
  }

  // =========================================================================
  // Coupons
  // =========================================================================

  couponApplied(coupon: string, discount?: number): void {
    this._track('Coupon Applied', {
      coupon,
      discount: discount ?? 0,
      cart_value: this.getCartValue(),
    });
  }

  // =========================================================================
  // Cart Accessors
  // =========================================================================

  getCart(): CartItem[] {
    return Array.from(this.cart.values());
  }

  async clearCart(): Promise<void> {
    this.cart.clear();
    await this._persistCart();
  }

  getCartValue(): number {
    let total = 0;
    for (const item of this.cart.values()) {
      total += item.price * item.quantity;
    }
    return +total.toFixed(2);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  destroy(): void {
    this.cart.clear();
    this.initialized = false;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private _track(event: string, properties: Record<string, unknown>): void {
    try {
      this.onTrack(event, properties);
    } catch {
      // Tracking failures must never break app functionality.
    }
  }

  private async _persistCart(): Promise<void> {
    try {
      const items = Array.from(this.cart.values());
      await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // Storage failures are non-critical; cart is still in memory.
    }
  }
}

// ---------------------------------------------------------------------------
// Default singleton (provide your own onTrack callback before first use)
// ---------------------------------------------------------------------------

const ecommerce = new RNEcommerceModule();
export default ecommerce;
