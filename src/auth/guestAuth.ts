import { supabase } from '../lib/supabaseClient'

export async function ensureGuestSession() {
  const sessionResult = await supabase.auth.getSession()
  if (sessionResult.error) {
    throw sessionResult.error
  }

  if (sessionResult.data.session) {
    return sessionResult.data.session
  }

  const signInResult = await supabase.auth.signInAnonymously()
  if (signInResult.error) {
    throw signInResult.error
  }

  return signInResult.data.session
}

export async function getAccessToken() {
  const session = await ensureGuestSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('Missing guest access token.')
  }

  return token
}
