import { Address } from '../infrastructure/domain/types';

export interface CustomerTaxDetails {
  isTaxExempt: boolean;
  taxIds: string[];
  address?: Address;
}
