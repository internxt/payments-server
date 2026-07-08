interface InvoiceItemsAttributes {
  id: string;
}

export class InvoiceItems implements InvoiceItemsAttributes {
  id: string;

  constructor({ id }: InvoiceItemsAttributes) {
    this.id = id;
  }

  static toDomain({ id }: InvoiceItemsAttributes): InvoiceItems {
    return new InvoiceItems({ id });
  }
}
