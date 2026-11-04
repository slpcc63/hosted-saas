const defaultAppSubdomain = "app";
const defaultRootDomain = "slpcc63.com";

type ProductHostEnvironment = {
  APP_SUBDOMAIN?: string;
  NEXT_PUBLIC_ROOT_DOMAIN?: string;
  TCM_QA_HOST?: string;
};

export function isTimeCardManagerQaHostname(
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  const configuredHostname = environment.TCM_QA_HOST?.trim().toLowerCase();

  return Boolean(configuredHostname) && hostname.toLowerCase() === configuredHostname;
}

export function isApplicationHostname(
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  const appSubdomain = environment.APP_SUBDOMAIN ?? defaultAppSubdomain;
  const rootDomain = environment.NEXT_PUBLIC_ROOT_DOMAIN ?? defaultRootDomain;

  return hostname === `${appSubdomain}.${rootDomain}` ||
    hostname === `${appSubdomain}.localhost` ||
    isTimeCardManagerQaHostname(hostname, environment);
}

export function getApplicationRewritePath(
  pathname: string,
  hostname: string,
  environment: ProductHostEnvironment = process.env as ProductHostEnvironment
) {
  if (pathname === "/" && isTimeCardManagerQaHostname(hostname, environment)) {
    return "/app/time-card-manager";
  }

  return pathname === "/" ? "/app" : `/app${pathname}`;
}
