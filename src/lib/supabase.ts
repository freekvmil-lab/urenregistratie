import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://shxlihgfdzfxwjewjnmj.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoeGxpaGdmZHpmeHdqZXdqbm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjMzNjYsImV4cCI6MjA5MzM5OTM2Nn0.oVVfy9AlEnnsEIPZoHglx8IjX-kSx3QABPwWBsUa0yE'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)
