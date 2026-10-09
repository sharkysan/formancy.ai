import type { FormSchema } from '@formancy/spec'

/**
 * The form this starter opens on: an expense claim.
 *
 * Chosen because it needs what a real form needs — a repeater of line items, a rule that
 * asks for a reason only when one of them is large, a receipt per line —
 * and because it shows both halves of the Material adapter: text, numbers, dates, a list,
 * radios and a tick drawn by Material, and a file drawn by the default control, since
 * Material has none. Replace it with your own document; nothing else in the app names a
 * field.
 */
export const EXPENSE_CLAIM: FormSchema = {
  specVersion: '4',
  id: 'expense-claim',
  title: 'Expense claim',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Your name', required: true },
      { key: 'email', type: 'text', label: 'Email', format: 'email', required: true },
      {
        key: 'department',
        type: 'select',
        label: 'Department',
        required: true,
        options: [
          { value: 'engineering', label: 'Engineering' },
          { value: 'sales', label: 'Sales' },
          { value: 'operations', label: 'Operations' },
        ],
      },
      { key: 'travelled', type: 'date', label: 'Date of travel', required: true },
      {
        key: 'purpose',
        type: 'radio',
        label: 'Purpose',
        required: true,
        options: [
          { value: 'customer', label: 'Customer visit' },
          { value: 'conference', label: 'Conference' },
          { value: 'internal', label: 'Internal meeting' },
        ],
      },
      {
        key: 'items',
        type: 'repeater',
        label: 'Expenses',
        minItems: 1,
        addLabel: 'Add an expense',
        removeLabel: 'Remove expense',
        fields: [
          { key: 'what', type: 'text', label: 'What', required: true },
          { key: 'amount', type: 'number', label: 'Amount (CHF)', min: 0, required: true },
          {
            key: 'receipt',
            type: 'file',
            label: 'Receipt',
            accept: ['image/*', 'application/pdf'],
          },
        ],
      },
      { key: 'reason', type: 'textarea', label: 'Why is an expense more than CHF 500?' },
      { key: 'confirm', type: 'checkbox', label: 'These expenses are correct', required: true },
    ],
  },
  logic: {
    rules: [
      // `has()` first: a row nobody has typed into has no `amount` key yet, and a visible
      // rule that throws shows the field it was meant to hide.
      {
        target: 'reason',
        kind: 'visible',
        cel: 'items.exists(i, has(i.amount) && i.amount != null && i.amount > 500.0)',
      },
      {
        target: 'reason',
        kind: 'required',
        cel: 'items.exists(i, has(i.amount) && i.amount != null && i.amount > 500.0)',
      },
    ],
  },
} as FormSchema
