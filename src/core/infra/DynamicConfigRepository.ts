export enum DynamicConfigKey {
  StripeKey = 'stripe_key',
}

export interface DynamicConfigEntry {
  key: DynamicConfigKey;
  value: string;
}

export interface DynamicConfigRepository {
  get(key: DynamicConfigKey): Promise<string | null>;
}
