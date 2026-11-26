import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getPublishedSeedMarketingProducts, seedProducts } from "../lib/catalog-data.ts";

test("homepage does not touch the database at render time", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /ensureSeedCatalog|getPublishedMarketingProducts|@\/lib\/seed|@\/lib\/db/);
});

test("static catalog lists only published, active seed products", () => {
  const listed = getPublishedSeedMarketingProducts().map((product) => product.slug);
  const expected = seedProducts
    .filter((product) => product.published === true && product.status === "active")
    .map((product) => product.slug);
  assert.deepEqual([...listed].sort(), [...expected].sort());
});

test("static catalog reproduces the database query's price and plan fields", () => {
  const timeCard = getPublishedSeedMarketingProducts().find(
    (product) => product.slug === "square-time-card-manager"
  );
  assert.ok(timeCard);
  assert.equal(timeCard.monthlyStartingPrice, 79);
  assert.equal(timeCard.planCount, 2);
  assert.equal(timeCard.pricingModel, "subscription");
  assert.equal(timeCard.platform, "Square");
});
