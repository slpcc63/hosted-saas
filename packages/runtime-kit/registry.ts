// Extension registry: the one place a product declares the facts that shared code needs about it.
// Shared code looks products up here instead of writing "if this product … else that product".
// This file must stay product-neutral: no product names, ids or vendor-specific defaults.

// Settings for one outside service a product connects to through OAuth. The provider's name is the
// key in `connections` (e.g. a POS or scheduling service); this file never names a provider.
export type ConnectionSettings = {
  // OAuth scopes requested when the product's own scopes setting is not configured.
  readonly defaultScopes: readonly string[];
  // Legacy shared-root deployments may read the provider's unprefixed settings for this product.
  readonly legacyUnprefixedSettings?: boolean;
  // Legacy shared-root redirect URI used when the product's own redirect setting is not configured.
  readonly legacyRedirectUri?: string;
};

export type ExtensionDefinition = {
  // Runtime id (SLPCC63_PRODUCT_RUNTIME value, products/<id> folder).
  readonly technicalId: string;
  readonly displayName: string;
  // Catalog / billing / installation id (products.slug, plugin_id columns).
  readonly productSlug: string;
  // Path of the product's own home page inside the customer app.
  readonly homePath: string;
  // Prefix for the product's own environment settings, e.g. <PREFIX>_DATABASE_URL.
  readonly environmentPrefix: string;
  // Outside services the product connects to, keyed by provider name. Absent for products that
  // connect to none.
  readonly connections?: Readonly<Record<string, ConnectionSettings>>;
};

export type ExtensionRegistry<T extends ExtensionDefinition> = {
  readonly definitions: readonly T[];
  readonly technicalIds: readonly T["technicalId"][];
  byTechnicalId(id: T["technicalId"]): T;
  findByTechnicalId(id: string | null | undefined): T | null;
  byProductSlug(slug: T["productSlug"]): T;
};

const environmentPrefixPattern = /^[A-Z][A-Z0-9_]*[A-Z0-9]$/;
const homePathPattern = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/;

export function createExtensionRegistry<const T extends ExtensionDefinition>(
  definitions: readonly T[]
): ExtensionRegistry<T> {
  const seen = { id: new Set<string>(), slug: new Set<string>(), prefix: new Set<string>() };

  for (const definition of definitions) {
    if (!definition.technicalId || seen.id.has(definition.technicalId)) {
      throw new Error(`Extension id must be present and unique: "${definition.technicalId}".`);
    }
    if (!definition.productSlug || seen.slug.has(definition.productSlug)) {
      throw new Error(`Extension product slug must be present and unique: "${definition.productSlug}".`);
    }
    if (!environmentPrefixPattern.test(definition.environmentPrefix) || seen.prefix.has(definition.environmentPrefix)) {
      throw new Error(`Extension environment prefix must be UPPER_SNAKE and unique: "${definition.environmentPrefix}".`);
    }
    if (!homePathPattern.test(definition.homePath)) {
      throw new Error(`Extension home path must look like /some-path: "${definition.homePath}".`);
    }
    for (const [provider, connection] of Object.entries(definition.connections ?? {})) {
      if (connection.defaultScopes.length === 0) {
        throw new Error(`Extension "${definition.technicalId}" declares ${provider} without default scopes.`);
      }
    }

    seen.id.add(definition.technicalId);
    seen.slug.add(definition.productSlug);
    seen.prefix.add(definition.environmentPrefix);
  }

  const byId = new Map(definitions.map((definition) => [definition.technicalId, definition]));
  const bySlug = new Map(definitions.map((definition) => [definition.productSlug, definition]));

  return {
    definitions,
    technicalIds: definitions.map((definition) => definition.technicalId),
    byTechnicalId(id) {
      const definition = byId.get(id);
      if (!definition) throw new Error(`Unknown extension id "${id}".`);
      return definition;
    },
    findByTechnicalId(id) {
      return id ? byId.get(id) ?? null : null;
    },
    byProductSlug(slug) {
      const definition = bySlug.get(slug);
      if (!definition) throw new Error(`Unknown extension product slug "${slug}".`);
      return definition;
    }
  };
}
