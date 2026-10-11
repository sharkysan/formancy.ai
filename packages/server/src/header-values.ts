/**
 * A response header's value made from data: a name somebody else chose
 * ([0175](../../../docs/decisions/0175-a-name-goes-into-a-header-encoded.md)).
 *
 * Node writes a header only when every character of its value is a tab, printable ASCII or one
 * of the bytes 0x80 to 0xFF, and throws `ERR_INVALID_CHAR` for anything else — when the reply is
 * written, after the route has answered. Nothing about a file's name or a form's path keeps it
 * inside that: a respondent names a file `日本 €.pdf`, an author publishes a path with a line
 * break in it. And the bytes 0x80 to 0xFF it does accept are no better: the server sent `é` as one
 * byte before a stream and as two, its UTF-8, before a string body, so a client read `café` on a
 * download and `cafÃ©` on an export.
 *
 * So a value is made here, from the data, in printable ASCII only, and a route writes what this
 * returns rather than a template of its own. `header-values.test.ts` holds every export to
 * every UTF-16 code unit, and reads the server's sources for a header written any other way.
 */

/**
 * `content-disposition` for a download, by RFC 6266: `attachment`, and the name twice when
 * ASCII cannot carry it — once readable, once exact.
 *
 * `filename` is a quoted string of printable ASCII, with every character it cannot hold as
 * itself made `_`: anything outside it, the quote that would end it, the backslash a reader may
 * or may not take as an escape, and the percent sign RFC 6266 (appendix D) says some readers
 * decode. `filename*` is RFC 8187's extended value, the name's UTF-8 percent-encoded, which
 * RFC 6266 has a reader prefer when both are there. It is added only when the readable one
 * lost something, so an ordinary name keeps the header it always had.
 *
 * The name is not cleaned of anything: a control character or a path separator goes to the
 * reader's browser encoded, and making a file name its system can hold is the browser's, as it
 * is for every download.
 */
export function attachment(filename: string): string {
  // `u`, so a character beyond the BMP is one `_` rather than one for each half of its pair.
  const readable = filename.replace(/[^\x20-\x7e]|["\\%]/gu, '_')
  if (readable === filename) return `attachment; filename="${readable}"`
  return `attachment; filename="${readable}"; filename*=UTF-8''${percentEncoded(filename)}`
}

/** RFC 8187's attr-char: what an extended value may hold as itself. */
const ATTR_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/

/**
 * `text` as UTF-8, each byte that is not an attr-char written `%XX`.
 *
 * Through a `Buffer` rather than `encodeURIComponent`, which leaves `'`, `(`, `)` and `*` as they
 * are — and a `'` ends an extended value's charset — and throws on a lone surrogate, which a
 * JSON body can carry. A `Buffer` writes one as U+FFFD.
 */
function percentEncoded(text: string): string {
  let encoded = ''
  for (const byte of Buffer.from(text, 'utf8')) {
    const character = String.fromCharCode(byte)
    encoded += ATTR_CHAR.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return encoded
}
