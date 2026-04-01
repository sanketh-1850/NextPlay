function trimEnvValue(value: string | undefined) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '')
}

export function normalizeSupabaseUrl(value: string | undefined) {
  const trimmed = trimEnvValue(value)
  if (!trimmed) {
    throw new Error('Missing Supabase URL. Set VITE_SUPABASE_URL.')
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    return parsed.origin
  } catch {
    throw new Error(`Invalid Supabase URL: ${trimmed}`)
  }
}

export function normalizePublicKey(value: string | undefined, label: string) {
  const trimmed = trimEnvValue(value)
  if (!trimmed) {
    throw new Error(`Missing ${label}.`)
  }
  return trimmed
}

export function normalizeApiBaseUrl(value: string | undefined) {
  const trimmed = trimEnvValue(value)
  if (!trimmed) {
    return 'http://localhost:8080'
  }

  const withProtocol =
    /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') ? trimmed : `http://${trimmed}`

  if (withProtocol.startsWith('/')) {
    return withProtocol.replace(/\/$/, '')
  }

  try {
    const parsed = new URL(withProtocol)
    return parsed.origin
  } catch {
    throw new Error(`Invalid API base URL: ${trimmed}`)
  }
}

export const frontendEnv = {
  supabaseUrl: normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: normalizePublicKey(
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    'VITE_SUPABASE_ANON_KEY',
  ),
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
}
