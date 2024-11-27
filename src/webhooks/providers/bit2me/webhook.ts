import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PaymentService } from "../../../services/payment.service";

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

async function _handlePaymentCompleted(
  bit2MeInvoiceId: string,
  paymentsService: PaymentService
): Promise<void> {
  const externalPayment: { externalProcessorId: string, stripeInvoiceId: string } =
  {} as any;
  const stripeInvoiceId = externalPayment.stripeInvoiceId;
  await paymentsService.markInvoiceAsPaid(stripeInvoiceId);
}

function buildHandlers(paymentsService: PaymentService) {
  return {
    paymentCompleted: (bit2MeInvoiceId: Bit2MePayment['id']) => {
      return _handlePaymentCompleted(bit2MeInvoiceId, paymentsService);
    }
  }
}

export function connect(server: FastifyInstance, paymentsService: PaymentService): void {
  server.post<{
    Body: any
  }>('/crypto', async (req, rep) => {
    try {
      // TODO: Validate signed request matching invoice id with the event
    } catch (err) {
  
    }

    const handlers = buildHandlers(paymentsService);
    const bit2MeInvoiceId = '';

    let event = {} as Bit2MePayment;
    const eventType: 'invoice' | 'payment' = 
      event.status === 'new' || event.status === 'pending' ? 
        'invoice' : 
        'payment';
    event = eventType === 'invoice' ? 
      (event as InvoiceCreated | InvoicePending) :
      (event as PaymentExpired | PaymentDetected | PaymentCompleted | PaymentAfterExpired)
  
    switch (event.status) {
      case Bit2MePaymentStatus.Completed:
        await handlers.paymentCompleted(bit2MeInvoiceId);
        break;
      case Bit2MePaymentStatus.PaidAfterExpired:
      case Bit2MePaymentStatus.Unpaid:
      case Bit2MePaymentStatus.Detected:
      case Bit2MePaymentStatus.Pending:
      case Bit2MePaymentStatus.New:
      case Bit2MePaymentStatus.Expired:
        break;
    }
  });
}
