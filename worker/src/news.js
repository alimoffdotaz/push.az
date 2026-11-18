/** Id kategoriy ostavleny dlya starogo API /api/user/news-categories. V pushi bolshe ne dobavlyayutsya. */
export const NEWS_CATEGORY_IDS = [
  'tech',
  'science',
  'space',
  'health',
  'nature',
  'culture',
  'business',
  'world',
];

const ID_SET = new Set(NEWS_CATEGORY_IDS);

export function normalizeNewsCategoryIds(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    if (typeof x === 'string' && ID_SET.has(x) && !out.includes(x)) out.push(x);
    if (out.length >= 6) break;
  }
  return out;
}
