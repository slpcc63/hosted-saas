type Environment = Record<string, string | undefined>;
const localUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/slpcc63?sslmode=disable';
export function getDatabaseUrl(env: Environment) {
  const value = env.DATABASE_URL || env.DATABASE_URL_UNPOOLED;
  if (!value && (env.VERCEL_ENV || env.NODE_ENV === 'production')) {
    throw new Error('Hosted database is not configured');
  }
  const parsed = new URL(value || localUrl);
  if (env.VERCEL_ENV === 'preview') {
    const host = (s: string) => s.replace('-pooler.', '.');
    if (!env.PREVIEW_DATABASE_HOST || !env.PREVIEW_DATABASE_NAME || !env.PREVIEW_DATABASE_ROLE ||
        host(parsed.hostname) !== host(env.PREVIEW_DATABASE_HOST) ||
        decodeURIComponent(parsed.pathname.slice(1)) !== env.PREVIEW_DATABASE_NAME ||
        decodeURIComponent(parsed.username) !== env.PREVIEW_DATABASE_ROLE) {
      throw new Error('Preview database does not match the isolated Preview binding');
    }
  }
  if (['prefer', 'require', 'verify-ca'].includes(parsed.searchParams.get('sslmode') || '')) {
    parsed.searchParams.set('sslmode', 'verify-full');
  }
  return parsed.toString();
}
