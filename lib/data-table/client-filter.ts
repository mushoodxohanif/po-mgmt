export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesSearch(
  haystacks: Array<string | null | undefined>,
  query: string,
) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;

  return haystacks.some((value) => value?.toLowerCase().includes(normalized));
}

export function matchesSpecsSearch(
  specs: Record<string, string>,
  description: string | null | undefined,
  query: string,
) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;

  if (description?.toLowerCase().includes(normalized)) {
    return true;
  }

  return Object.entries(specs).some(
    ([key, value]) =>
      key.toLowerCase().includes(normalized) ||
      value.toLowerCase().includes(normalized),
  );
}
