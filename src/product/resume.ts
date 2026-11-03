/** The site Continue should restore. A missing last row is not replaced by a different site. */
export function resumeTarget<T extends { id: string }>(sites: readonly T[], lastOpenedId: string): T | undefined {
  if (lastOpenedId) return sites.find(site => site.id === lastOpenedId)
  return sites.length === 1 ? sites[0] : undefined
}
