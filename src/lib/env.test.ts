import { describe, expect, it } from 'vitest'
import { normalizeApiBaseUrl, normalizePublicKey, normalizeSupabaseUrl } from './env'

describe('env normalization', () => {
  it('adds https to a bare Supabase host', () => {
    expect(normalizeSupabaseUrl('ogqkdzuukhkldkgnddru.supabase.co')).toBe(
      'https://ogqkdzuukhkldkgnddru.supabase.co',
    )
  })

  it('strips quotes and whitespace from keys', () => {
    expect(normalizePublicKey('  "abc123"  ', 'TEST_KEY')).toBe('abc123')
  })

  it('normalizes api base urls without a scheme', () => {
    expect(normalizeApiBaseUrl('localhost:8080')).toBe('http://localhost:8080')
  })
})
