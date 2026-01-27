import { createClient } from '@supabase/supabase-js';

// Helper to safely access process.env if available (bundlers), import.meta.env (Vite), or fallback
const getEnv = (key: string, fallback: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // @ts-ignore - for Vite environments
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  return fallback;
};

// These should be environmental variables in a real production build
const SUPABASE_URL = getEnv('SUPABASE_URL', 'https://your-project.supabase.co');
const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY', 'your-anon-key');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);