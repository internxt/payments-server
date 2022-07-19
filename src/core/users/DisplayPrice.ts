export interface DisplayPrice {
  id: string;
  bytes: number;
  interval: 'year' | 'month';
  amount: number;
  currency: string;
}
