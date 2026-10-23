export function squareCallbackUrl(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV === 'preview') {
    if (!env.VERCEL_URL) throw new Error('Preview deployment URL is required for Square OAuth');
    return `https://${env.VERCEL_URL}/api/integrations/square/callback`;
  }
  return env.SQUARE_REDIRECT_URI ?? 'https://hosted-saas.vercel.app/api/integrations/square/callback';
}
