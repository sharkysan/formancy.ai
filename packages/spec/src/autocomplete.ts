/*
 * The autofill vocabulary, which changes with the HTML standard rather than with the format's
 * own constructs — its own module for that reason, and because `types.ts` was over its size
 * budget when it arrived.
 */

/**
 * The autofill hints a field may carry (0195): WCAG 2.2's input purposes, which are the HTML
 * autofill field names a browser understands, **without the password and payment-card ones**.
 * A form platform keeps what is typed into it, and a hint that invites a browser to put a card
 * number or a password into a stored submission is a liability nobody adopting this should take
 * on by accident. A list rather than a union so `formancy.schema.json` can offer the same values
 * and a test can compare the two.
 */
export const AUTOCOMPLETE_TOKENS = [
  'name',
  'honorific-prefix',
  'given-name',
  'additional-name',
  'family-name',
  'honorific-suffix',
  'nickname',
  'username',
  'organization-title',
  'organization',
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level4',
  'address-level3',
  'address-level2',
  'address-level1',
  'country',
  'country-name',
  'postal-code',
  'transaction-currency',
  'transaction-amount',
  'language',
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'sex',
  'url',
  'photo',
  'tel',
  'tel-country-code',
  'tel-national',
  'tel-area-code',
  'tel-local',
  'tel-local-prefix',
  'tel-local-suffix',
  'tel-extension',
  'email',
  'impp',
] as const

export type AutocompleteToken = (typeof AUTOCOMPLETE_TOKENS)[number]
