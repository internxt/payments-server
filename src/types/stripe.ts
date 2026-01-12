import Stripe from 'stripe';

export type Customer = Stripe.Customer;
export type CustomerId = Customer['id'];
export type CustomerEmail = Customer['email'];

export type Price = Stripe.Price;
export type Plan = Stripe.Plan;
export type PriceId = Price['id'];
export type PlanId = Plan['id'];

export type Subscription = Stripe.Subscription;
export type SubscriptionId = Subscription['id'];

export interface ExtendedSubscription extends Subscription {
  product?: Stripe.Product;
}

export type Invoice = Stripe.Invoice;

export type SetupIntent = Stripe.SetupIntent;

export type PaymentMethod = Stripe.PaymentMethod;

export type CustomerSource = Stripe.CustomerSource;

export type PriceMetadata = {
  maxSpaceBytes: string;
  planType: 'subscription' | 'one_time';
};
