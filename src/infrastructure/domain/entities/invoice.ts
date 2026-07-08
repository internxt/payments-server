export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';

interface InvoiceAttributes {
  id: string;
  clientSecretId?: string;
  status?: InvoiceStatus;
}

export class Invoice implements InvoiceAttributes {
  id: string;
  clientSecretId?: string;
  status?: InvoiceStatus;
  constructor({ id, clientSecretId, status }: InvoiceAttributes) {
    this.id = id;
    this.clientSecretId = clientSecretId;
    this.status = status;
  }

  static toDomain({ id, clientSecretId }: InvoiceAttributes): Invoice {
    return new Invoice({ id, clientSecretId });
  }
}
