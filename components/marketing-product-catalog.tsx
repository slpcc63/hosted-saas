"use client";

import { useMemo, useState } from "react";

import type { MarketingProduct } from "@/lib/products";

type MarketingProductCatalogProps = {
  products: MarketingProduct[];
};

type PriceFilter = "all" | "free" | "1-5" | "5-10" | "10-50" | "50+";

const priceFilterLabels: Record<PriceFilter, string> = {
  all: "All pricing",
  free: "Free",
  "1-5": "$1-5 / month",
  "5-10": "$5-10 / month",
  "10-50": "$10-50 / month",
  "50+": "$50+ / month"
};

function normalizePlatforms(products: MarketingProduct[]) {
  return Array.from(
    new Set(
      products
        .flatMap((product) => (product.platform ?? "").split("+"))
        .map((platform) => platform.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function matchesPriceFilter(product: MarketingProduct, priceFilter: PriceFilter) {
  if (priceFilter === "all") {
    return true;
  }

  const price = product.monthlyStartingPrice;

  if (priceFilter === "free") {
    return price === 0;
  }

  if (price === null) {
    return false;
  }

  if (priceFilter === "1-5") {
    return price >= 1 && price <= 5;
  }

  if (priceFilter === "5-10") {
    return price > 5 && price <= 10;
  }

  if (priceFilter === "10-50") {
    return price > 10 && price <= 50;
  }

  return price > 50;
}

function formatPricing(product: MarketingProduct) {
  if (product.pricingModel === "custom_quote") {
    return "Custom quote";
  }

  if (product.monthlyStartingPrice === null) {
    return "Contact for pricing";
  }

  if (product.monthlyStartingPrice === 0) {
    return "Free";
  }

  return `From $${product.monthlyStartingPrice}/mo`;
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MarketingProductCatalog({
  products
}: MarketingProductCatalogProps) {
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  const platformOptions = useMemo(() => normalizePlatforms(products), [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesPlatform =
        platformFilter === "all" ||
        (product.platform ?? "")
          .split("+")
          .map((platform) => platform.trim())
          .includes(platformFilter);

      return matchesPlatform && matchesPriceFilter(product, priceFilter);
    });
  }, [platformFilter, priceFilter, products]);

  return (
    <section className="catalog-section" id="products">
      <div className="catalog-intro">
        <div>
          <p className="catalog-kicker">Products</p>
          <h1>Browse plugins, apps, and custom builds.</h1>
        </div>
        <p className="catalog-summary">
          Only currently approved offerings are shown here.
        </p>
      </div>

      <div className="catalog-filters" aria-label="Product filters" id="filters">
        <label className="catalog-filter">
          <span>Platform</span>
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
          >
            <option value="all">All platforms</option>
            {platformOptions.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <label className="catalog-filter">
          <span>Price</span>
          <select
            value={priceFilter}
            onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}
          >
            {Object.entries(priceFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="catalog-meta">
        <p>{filteredProducts.length} products</p>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="catalog-empty">
          <h2>No products match those filters.</h2>
          <p>Try switching platform or widening the monthly price range.</p>
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-card-top">
                <span className="product-category">
                  {formatCategory(product.category)}
                </span>
                <p className="product-pricing">{formatPricing(product)}</p>
              </div>

              <div className="product-copy">
                <h2>{product.title}</h2>
                <p>
                  {product.shortDescription ?? "More details coming soon for this product."}
                </p>
              </div>

              <div className="product-meta">
                <span>{product.platform ?? "Platform TBD"}</span>
                <span>{product.planCount > 0 ? `${product.planCount} plans` : "Custom scope"}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
