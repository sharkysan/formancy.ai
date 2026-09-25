/**
 * The mark — the same one as the favicon, the landing page and the
 * playground. Hidden from assistive technology: the name beside it already
 * says what it is, and hearing it twice helps nobody.
 */
export function Mark() {
  return (
    <svg className="wb-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="#10141c" />
      <rect x="14" y="14" width="12" height="36" rx="6" fill="#8b7bff" />
      <rect x="30" y="14" width="20" height="12" rx="6" fill="#3fe0d5" />
      <rect x="30" y="30" width="14" height="12" rx="6" fill="#3fe0d5" />
    </svg>
  )
}
