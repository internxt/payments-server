enum Bit2MePaymentStatus {
  Completed = 'paid',
  Unpaid = 'unpaid',
  Expired = 'expired',
  PaidAfterExpired = 'paid_after_expired',
  Detected = 'confirming',
  Pending = 'pending',
  New = 'new',
}

interface Bit2MePayment {
  id: string;
  foreignId: string;
  cryptoAddress: {
    currency: string;
    address: string;
  };
  currencySent: {
    currency: string;
    amount: string;
    remainingAmount: string;
  };
  currencyReceived: {
    currency: string;
  };
  token: string;
  transactions: any[];
  fees: any[];
  error: any[];   
  status: Bit2MePaymentStatus;
}

interface InvoicePending extends Bit2MePayment {
  status: Bit2MePaymentStatus.Pending
}

interface InvoiceCreated extends Bit2MePayment {
  status: Bit2MePaymentStatus.New
}

interface PaymentDetected extends Bit2MePayment {
  status: Bit2MePaymentStatus.Detected
}

interface PaymentCompleted extends Bit2MePayment {
  status: Bit2MePaymentStatus.Completed
}

interface PaymentExpired extends Bit2MePayment {
  status: Bit2MePaymentStatus.Expired
}

interface PaymentAfterExpired extends Bit2MePayment {
  status: Bit2MePaymentStatus.PaidAfterExpired
}
