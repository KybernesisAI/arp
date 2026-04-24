import catalog from '../.generated/catalog.json' with { type: 'json' };

export type ScopeParameter = {
  name: string;
  type: string;
  required?: boolean;
  default?: unknown;
  validation?: string;
};

export type ScopeObligation = {
  type: string;
  params?: Record<string, unknown>;
};

export type Scope = {
  id: string;
  version: string;
  label: string;
  description: string;
  category: string;
  risk: 'low' | 'medium' | 'high' | 'critical' | string;
  parameters: ScopeParameter[];
  cedar_template: string;
  consent_text_template: string;
  obligations_forced: ScopeObligation[];
  implies: string[];
  conflicts_with: string[];
  step_up_required: boolean;
};

export type CatalogManifest = {
  version: string;
  updated_at: string;
  scope_count: number;
  checksum: string;
  scopes: unknown[];
};

export type Catalog = {
  scopes: Scope[];
  manifest: CatalogManifest;
  yaml: Record<string, string>;
};

/**
 * Bundled at build time by `scripts/bundle-catalog.mjs`. That script is
 * wired into `pnpm run build` via a prebuild hook so the artefact is
 * always fresh against `packages/scope-catalog`.
 */
export function loadCatalog(): Catalog {
  return catalog as unknown as Catalog;
}

export function categoriesOf(scopes: Scope[]): string[] {
  const set = new Set<string>();
  for (const s of scopes) set.add(s.category);
  return Array.from(set).sort();
}

export function risksOf(scopes: Scope[]): string[] {
  const order = ['low', 'medium', 'high', 'critical'];
  const present = new Set(scopes.map((s) => s.risk));
  return order.filter((r) => present.has(r));
}
