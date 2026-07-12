import { createClient } from '@supabase/supabase-js'

// Publieke client-configuratie voor het Supabase-project "eten-avontuur".
// De publishable key is bedoeld voor gebruik in de browser; RLS beschermt de data.
const SUPABASE_URL = 'https://wmdopfocqufsquzvemka.supabase.co'
const SUPABASE_KEY = 'sb_publishable_0vzeEC0FttISlsEiDaFCnw_N7bjjNym'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
