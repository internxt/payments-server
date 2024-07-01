export interface DisplayPrice {
  id: string;
  bytes: number;
  interval: 'year' | 'month' | 'lifetime';
  amount: number;
  currency: string;
}

export interface RequestedPlan {
  selectedPlan: DisplayPrice & { decimalAmount: number };
  upsellPlan?: DisplayPrice & { decimalAmount: number };
}
