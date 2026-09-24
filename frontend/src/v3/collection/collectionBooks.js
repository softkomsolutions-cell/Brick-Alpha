/**
 * CURATED and FULL COLLECTION are two books over the same ledger.
 *
 * A position belongs to the full book always.
 * It belongs to the curated book unless it is full-only.
 * Full-only means collectionBook === "full" or curated === false.
 *
 * Full-only positions must not affect curated concentration, performance,
 * buy decisions, or theme caps. Unmarked positions belong to both books.
 */
export function isFullOnlyPosition(trade) {
  return trade?.collectionBook === "full" || trade?.curated === false;
}

export function tradesForBook(trades = [], book = "curated") {
  const list = Array.isArray(trades) ? trades : [];
  if (book === "full") {
    return list;
  }
  return list.filter((trade) => !isFullOnlyPosition(trade));
}
