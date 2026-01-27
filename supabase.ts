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

// --- CONFIGURATION ---
// If you are running locally without a .env file, replace these strings with your actual Supabase credentials.
const DEFAULT_URL = 'https://your-project.supabase.co';
const DEFAULT_KEY = 'your-anon-key';

const SUPABASE_URL = getEnv('SUPABASE_URL', DEFAULT_URL);
const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY', DEFAULT_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Checks if the Supabase client is configured with valid credentials.
 * Returns an object with validity status and a helpful message if invalid.
 */
export const checkSupabaseConfig = (): { valid: boolean; message?: string } => {
  if (SUPABASE_URL === DEFAULT_URL || SUPABASE_URL.includes('your-project')) {
    return { 
      valid: false, 
      message: "Supabase URL is missing. Please open 'supabase.ts' and add your Project URL." 
    };
  }
  if (SUPABASE_ANON_KEY === DEFAULT_KEY || SUPABASE_ANON_KEY.includes('your-anon-key')) {
     return { 
      valid: false, 
      message: "Supabase API Key is missing. Please open 'supabase.ts' and add your Anon Key." 
    };
  }
  return { valid: true };
};