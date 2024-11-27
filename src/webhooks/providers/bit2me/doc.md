# Bit2Me
They work with webhooks, the received events we may receive are the following ones:

Created invoice
```
{
  "id": "666c4e53-9121-40aa-850a-0c9990010d7d",
  "foreignId": "BWpSk4yzcuO3nh11",
  "cryptoAddress": {},
  "currencySent": {},
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "new"
}
```

- Invoice ready to be paid ('activated')
```
{
  "id": "666c4e53-9121-40aa-850a-0c9990010d7d",
  "foreignId": "BWpSk4yzcuO3nh11",
  "cryptoAddress": {
    "currency": "USDT",
    "address": "0xb27718181446445cec93F889d6fA8F408825eC07"
  },
  "currencySent": {
    "currency": "USDT",
    "amount": 8.8249,
    "remainingAmount": "8.8249"
  },
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "pending"
}
```

- Detected payment
```
{
  "id": "666c4e53-9121-40aa-850a-0c9990010d7d",
  "foreignId": "BWpSk4yzcuO3nh11",
  "cryptoAddress": {
    "currency": "USDT",
    "address": "0xb27718181446445cec93F889d6fA8F408825eC07"
  },
  "currencySent": {
    "currency": "USDT",
    "amount": "8.824900000000000000",
    "remainingAmount": "0"
  },
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "confirming"
}
```

- Payment completed (aka success)
```
{
  "id": "666c4e53-9121-40aa-850a-0c9990010d7d",
  "foreignId": "BWpSk4yzcuO3nh11",
  "cryptoAddress": {
    "currency": "USDT",
    "address": "0xb27718181446445cec93F889d6fA8F408825eC07"
  },
  "currencySent": {
    "currency": "USDT",
    "amount": "8.824900000000000000",
    "remainingAmount": "0"
  },
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "paid"
}
```

- Payment expired
```
{
  "id": "9e8bd9b4-a404-4195-95f4-3d0a4514b333",
  "foreignId": "FFpSk4yzcuO3nh11",
  "cryptoAddress": {
    "currency": "USDT",
    "address": "0xf44718181446445cec93F889d6fA8F408825eD07"
  },
  "currencySent": {
    "currency": "USDT",
    "amount": "4.443300000000000000",
    "remainingAmount": "4.4433"
  },
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "expired"
}
```

- Paid after payment expired
```
{
  "id": "9e8bd9b4-a404-4195-95f4-3d0a4514b333",
  "foreignId": "FFpSk4yzcuO3nh11",
  "cryptoAddress": {
    "currency": "USDT",
    "address": "0xf44718181446445cec93F889d6fA8F408825eD07"
  },
  "currencySent": {
    "currency": "USDT",
    "amount": "4.443300000000000000",
    "remainingAmount": "0"
  },
  "currencyReceived": {
    "currency": "EUR"
  },
  "token": "sRvfOoCpI26MPP8pJqWx",
  "transactions": [],
  "fees": [],
  "error": [],
  "status": "paid_after_expired"
}
```

## What?
A crypto payments processor integrated as an Internxt's Payment method. We register the webhook handler and start working with them. We integrated them on our integrated's checkout so we can process the payment as they instructed us to do so.

## How
Keeping everything consistent with Stripe while processing the payment with crypto using Bit2Me Processor.

- We create an integrated checkout which creates the customer and the invoice being ready to be paid
- We store that invoice ID and relate it to the Bit2Me payment
- As Bit2Me validates a given webhook using their own invoices ID, we need to store Bit2Me Invoice ID + Stripe's invoice ID to recover them when the payment is finished (either successfully or not)
  - If the payment is successful, we recover those IDs, mark the Stripe's invoice as `paid_out_of_band` [(how?)](https://docs.stripe.com/api/invoices/pay#pay_invoice-paid_out_of_band) and add the Bit2Me Invoice ID to the Stripe's Invoice metadata, so we left the history there to keep the track of this event.

