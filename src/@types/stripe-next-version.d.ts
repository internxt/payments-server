declare module 'stripe-next-version' {
  export * from 'stripe-next-version/types/index';
  const Stripe: typeof import('stripe-next-version/types/index').default;
  export default Stripe;
}
