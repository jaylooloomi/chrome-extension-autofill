// Hostname helpers for the per-site enable/disable list.

/** Normalize a hostname for matching: lowercase and drop a leading "www.".
 *  So "www.Example.com" and "example.com" are treated as the same site. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** Is `host` covered by the disabled list (www-insensitive)? */
export function isHostDisabled(host: string, disabled: string[]): boolean {
  const h = normalizeHost(host);
  return disabled.some((d) => normalizeHost(d) === h);
}
