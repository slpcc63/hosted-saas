import { findQaFocusExtension } from "./extension-registry.ts";

const defaultAppSubdomain = "app";
const defaultRootDomain = "slpcc63.com";

type ProductHostEnvironment = Readonly<Record<string, string | undefined>> & {
  APP_SUBDOMAIN?: string;
  NEXT_PUBLIC_ROOT_DOMAIN?: string;
};

// App path of the product a QA hostname opens into (from the registry), or null.
export function getQaFocusHomePath(
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  return findQaFocusExtension(hostname, environment)?.homePath ?? null;
}

export function isQaFocusHostname(
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  return getQaFocusHomePath(hostname, environment) !== null;
}

export function isApplicationHostname(
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  const appSubdomain = environment.APP_SUBDOMAIN ?? defaultAppSubdomain;
  const rootDomain = environment.NEXT_PUBLIC_ROOT_DOMAIN ?? defaultRootDomain;

  return hostname === `${appSubdomain}.${rootDomain}` ||
    hostname === `${appSubdomain}.localhost` ||
    isQaFocusHostname(hostname, environment);
}

export function getApplicationRewritePath(
  pathname: string,
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  const qaFocusHomePath = pathname === "/" ? getQaFocusHomePath(hostname, environment) : null;

  if (qaFocusHomePath) {
    return `/app${qaFocusHomePath}`;
  }

  return pathname === "/" ? "/app" : `/app${pathname}`;
}
