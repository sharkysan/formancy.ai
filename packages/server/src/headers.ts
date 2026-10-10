/**
 * The header a client declares what it was looking at with.
 *
 * One name, read by the submission route and by the publish plugin: a
 * submission says which version it rendered, and a publish says which version it
 * opened. Two spellings of one header is a bug nobody sees until a client sends
 * the other one.
 */
export const SCHEMA_HASH_HEADER = 'x-formancy-schema-hash'

/** A solved proof-of-work challenge, as base64 JSON: the shape an ALTCHA client already produces. */
export const CHALLENGE_HEADER = 'x-formancy-challenge'

/**
 * The token a response is sent with: handed out with the form, and with a draft, naming the id
 * the response is stored under (0169). Required of an anonymous submission.
 */
export const SUBMISSION_TOKEN_HEADER = 'x-formancy-submission-token'
