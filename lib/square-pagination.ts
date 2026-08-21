export async function collectSquarePages<T>(
  fetchPage: (cursor?: string) => Promise<{ cursor?: string; items?: T[] }>
) {
  const items: T[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    if (page.items?.length) items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);

  return items;
}
