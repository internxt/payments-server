export enum PreCreatedUserStatus {
  AwaitingPayment = 'awaiting_payment',
  PendingSetup = 'pending_setup',
  Cancelled = 'cancelled',
}

interface PreCreatedUserAttributes {
  uuid: string;
  status: PreCreatedUserStatus;
}

export class PreCreatedUser implements PreCreatedUserAttributes {
  uuid: string;
  status: PreCreatedUserStatus;

  constructor({ uuid, status }: PreCreatedUserAttributes) {
    this.uuid = uuid;
    this.status = status;
  }

  static toDomain(attributes: PreCreatedUserAttributes): PreCreatedUser {
    return new PreCreatedUser(attributes);
  }

  get isPendingStatus(): boolean {
    return this.status === PreCreatedUserStatus.PendingSetup;
  }
}
