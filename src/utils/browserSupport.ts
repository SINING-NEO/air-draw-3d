/** Detect browsers that need extra compatibility handling. */

export function isEdgeBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /\bEdg\//i.test(navigator.userAgent)
}
