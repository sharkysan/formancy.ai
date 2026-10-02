/**
 * The header a client declares what it was looking at with.
 *
 * One name, read by the submission route and by the publish plugin: a
 * submission says which version it rendered, and a publish says which version it
 * opened. Two spellings of one header is a bug nobody sees until a client sends
 * the other one.
 */
export const SCHEMA_HASH_HEADER = 'x-formancy-schema-hash'
