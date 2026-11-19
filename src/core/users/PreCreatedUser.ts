export enum PreCreatedUserStatus {
  AwaitingPayment = 'awaiting_payment',
  PendingSetup = 'pending_setup',
  Cancelled = 'cancelled',
}

export interface PreCreatedUser {
  uuid: string;
  status: PreCreatedUserStatus;
}
