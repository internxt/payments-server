# Load Licenses

This command allows to introduce license codes on the payments service. This codes are mapped to Stripe Price Ids and are allowing to redeem Stripe Plans - through the payments service, ofc -.

The current supported formats to introduce the codes are:

- XLSX

## How to: Allowed formats

### XLSX

To introduce codes in this format, the Excel should have the following structure:

| price_id_A             | price_id_B             | ... | price_id_X             |
| ---------------------- | ---------------------- | --- | ---------------------- |
| code_1_for_redeeming_A | code_1_for_redeeming_B | ... |                        |
| code_2_for_redeeming_A | code_2_for_redeeming_B | ... |                        |
| ...                    | ...                    | ... | ...                    |
| code_X_for_redeeming_A | code_X_for_redeeming_B |     | code_X_for_redeeming_X |

Where, for instance, `price_id_A` is a Stripe Price Id and `code_1_for_redeeming_A` will be the code sent to the payments service to redeem the Stripe Plan referred by `price_id_A`.

# determine lifetime user

Determines the lifetime conditions for a user, including their tier and max storage space.

#### Usage

```bash
yarn cli:determine-lifetime <customerId> <lastPurchasedTierProductId>
```

#### Parameters

- `customerId`: Stripe customer ID
- `lastPurchasedTierProductId`: Product ID of the purchased lifetime tier (It has to has a tier assigned)

#### Example

```bash
yarn cli:determine-lifetime cus_ABC123XYZ prod_DEF456UVW
```

The script handles different scenarios:

- Free user → assigns the purchased lifetime tier
- Subscribed user → cancels subscription and assigns lifetime tier
- Lifetime user → stacks the new purchase (sums storage and assigns highest tier)
