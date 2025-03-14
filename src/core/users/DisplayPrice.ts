export interface DisplayPrice {
  id: string;
  productId?: string;
  bytes: number;
  interval: 'year' | 'month' | 'lifetime';
  amount: number;
  currency: string;
}
