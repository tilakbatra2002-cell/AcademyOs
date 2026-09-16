import crypto from 'crypto';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export interface PaymentOrderInput {
  amount: number; // major units (e.g. INR rupees)
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface PaymentOrder {
  provider: string;
  orderId: string;
  amount: number;
  currency: string;
  /** Public key/client secret the browser needs to open the checkout. */
  clientKey?: string;
  configured: boolean;
}

export interface VerifyInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createOrder(input: PaymentOrderInput): Promise<PaymentOrder>;
  verifySignature(input: VerifyInput): Promise<boolean>;
}

/**
 * Manual/offline provider — the default in development and for academies that
 * collect fees offline. It NEVER claims an online payment succeeded; the admin
 * records the payment explicitly through the finance module.
 */
class ManualProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly configured = true;
  async createOrder(): Promise<PaymentOrder> {
    throw new ApiError(
      'PROVIDER_NOT_CONFIGURED',
      'No online payment gateway is configured. Record this payment manually (cash / UPI / bank transfer) from the Payments screen.',
    );
  }
  async verifySignature(): Promise<boolean> {
    return false;
  }
}

class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly configured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

  async createOrder(input: PaymentOrderInput): Promise<PaymentOrder> {
    if (!this.configured) {
      throw new ApiError('PROVIDER_NOT_CONFIGURED', 'Razorpay credentials are not configured on this server.');
    }
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
    if (!res.ok) throw ApiError.internal(`Razorpay order creation failed (${res.status})`);
    const json = (await res.json()) as { id: string; amount: number; currency: string };
    return {
      provider: this.name,
      orderId: json.id,
      amount: json.amount / 100,
      currency: json.currency,
      clientKey: env.RAZORPAY_KEY_ID,
      configured: true,
    };
  }

  async verifySignature({ orderId, paymentId, signature }: VerifyInput): Promise<boolean> {
    if (!this.configured) return false;
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }
}

class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly configured = Boolean(env.STRIPE_SECRET_KEY);

  async createOrder(input: PaymentOrderInput): Promise<PaymentOrder> {
    if (!this.configured) {
      throw new ApiError('PROVIDER_NOT_CONFIGURED', 'Stripe credentials are not configured on this server.');
    }
    const body = new URLSearchParams({
      amount: String(Math.round(input.amount * 100)),
      currency: input.currency.toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
      description: input.receipt,
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) throw ApiError.internal(`Stripe payment intent failed (${res.status})`);
    const json = (await res.json()) as { id: string; client_secret: string; amount: number; currency: string };
    return {
      provider: this.name,
      orderId: json.id,
      amount: json.amount / 100,
      currency: json.currency.toUpperCase(),
      clientKey: json.client_secret,
      configured: true,
    };
  }

  async verifySignature({ paymentId }: VerifyInput): Promise<boolean> {
    if (!this.configured) return false;
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentId}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { status: string };
    return json.status === 'succeeded';
  }
}

const providers: Record<string, PaymentProvider> = {
  manual: new ManualProvider(),
  razorpay: new RazorpayProvider(),
  stripe: new StripeProvider(),
};

export function getPaymentProvider(name?: string): PaymentProvider {
  return providers[name || env.PAYMENT_PROVIDER] ?? providers.manual;
}

export function paymentGatewayStatus() {
  return {
    active: env.PAYMENT_PROVIDER,
    razorpay: providers.razorpay.configured,
    stripe: providers.stripe.configured,
    onlineEnabled: env.PAYMENT_PROVIDER !== 'manual' && providers[env.PAYMENT_PROVIDER]?.configured === true,
  };
}
