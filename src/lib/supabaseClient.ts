import { createClient } from '@supabase/supabase-js'
import { frontendEnv } from './env'

export const supabase = createClient(frontendEnv.supabaseUrl, frontendEnv.supabaseAnonKey)
