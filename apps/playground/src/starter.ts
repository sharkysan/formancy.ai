/**
 * The schema the playground opens with: small enough to read in one breath,
 * but exercising the headline behaviours — a conditional field, a computed
 * total over repeater rows, per-row validation and a required consent box.
 */
export const STARTER_SCHEMA = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer', required: true },
      {
        key: 'country',
        type: 'select',
        label: 'Country',
        options: [
          { value: 'CH', label: 'Switzerland' },
          { value: 'DE', label: 'Germany' },
        ],
      },
      { key: 'canton', type: 'text', label: 'Canton' },
      {
        key: 'items',
        type: 'repeater',
        label: 'Items',
        minItems: 1,
        addLabel: 'Add item',
        removeLabel: 'Remove item',
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'qty', type: 'number', label: 'Quantity' },
        ],
      },
      { key: 'terms', type: 'checkbox', label: 'I accept the terms', required: true },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      {
        target: 'items[].qty',
        kind: 'validate',
        cel: 'item.qty == null || item.qty > 0.0',
        code: 'notPositive',
      },
    ],
  },
}
