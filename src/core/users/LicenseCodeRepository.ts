import { LicenseCode } from './LicenseCode';

export interface LicenseCodesRepository {
  findOne(code: LicenseCode['code'], provider: LicenseCode['provider']): Promise<LicenseCode | null>;
  insert(licenseCode: LicenseCode): Promise<void>;
  updateByCode(code: LicenseCode['code'], body: Partial<Omit<LicenseCode, 'code'>>): Promise<boolean>;
}
