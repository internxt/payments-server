import { PlanSubscription } from '../../services/PaymentService';

export interface User {
  id: string;
  customerId: string;
  uuid: string;
  lifetime?: boolean;
}

export enum UserType {
  Individual = 'individual',
  Business = 'business',
  ObjectStorage = 'object-storage',
}

export type UserSubscription =
  | { type: 'free' | 'lifetime' }
  | {
      type: 'subscription';
      subscriptionId: string;
      amount: number;
      currency: string;
      amountAfterCoupon?: number;
      interval: 'year' | 'month';
      nextPayment: number;
      priceId: string;
      planId?: string;
      userType?: UserType;
      plan: PlanSubscription;
    };
