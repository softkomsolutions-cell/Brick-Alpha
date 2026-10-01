import test from "node:test";
import assert from "node:assert/strict";
import { findCatalogMatch } from "../src/scanEvaluationData.js";

test("numeric Scan matching never falls back to a different LEGO set", () => {
  const catalog = [
    {
      id: "lego-star-wars-75252",
      sku: "75252",
      brand: "LEGO",
      name: "Imperial Star Destroyer",
    },
  ];

  assert.equal(findCatalogMatch(catalog, "75313"), null);
  assert.equal(findCatalogMatch(catalog, "75252")?.sku, "75252");
});
