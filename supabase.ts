import { createClient } from '@supabase/supabase-js';

// Helper to safely access process.env if available (bundlers), import.meta.env (Vite), or fallback
const getEnv = (key: string, fallback?: string): string | undefined => {
  // Check process.env (Standard / Next.js / Create React App)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // Check import.meta.env (Vite)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  return fallback;
};

// --- CONFIGURATION ---
// 1. URL: Updated to your project
const DEFAULT_URL = 'https://ozolagmwrjesamwfmmoj.supabase.co';

// 2. KEY: Updated with the specific anon key provided
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96b2xhZ213cmplc2Ftd2ZtbW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDExNDMsImV4cCI6MjA4MDQxNzE0M30.tg0NlDo8JCydXXphgNmYnnV7-4I1b6fPYcDhvIUA_ao';

// Logic to find the key from various common environment variable names
const FOUND_KEY = 
  getEnv('SUPABASE_ANON_KEY') || 
  getEnv('VITE_SUPABASE_ANON_KEY') || 
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 
  getEnv('SUPABASE_KEY') || 
  DEFAULT_KEY;

const SUPABASE_URL = getEnv('SUPABASE_URL', DEFAULT_URL) as string;
// Trim whitespace to prevent copy-paste errors causing "Failed to fetch"
const SUPABASE_ANON_KEY = (FOUND_KEY || '').trim();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Checks if the Supabase client is configured with valid credentials strings.
 */
export const checkSupabaseConfig = (): { valid: boolean; message?: string } => {
  if (!SUPABASE_URL || SUPABASE_URL.includes('your-project')) {
    return { 
      valid: false, 
      message: "Supabase URL is invalid. Please check 'supabase.ts'." 
    };
  }
  
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'your-anon-key' || SUPABASE_ANON_KEY.length < 10) {
     return { 
      valid: false, 
      message: "Supabase API Key is missing or invalid. Check 'supabase.ts'." 
    };
  }
  return { valid: true };
};

/**
 * Performs a real network request to verify connectivity.
 * "Failed to fetch" usually means Network Error, Ad Blocker, or Bad Key format.
 */
export const testConnection = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    // We try to fetch the server time or a public table. 
    // Even if the table doesn't exist, Supabase returns a 404/400 (which means connection succeeded).
    // If we get a generic Error or TypeError, the connection failed.
    const { error } = await supabase.from('teachers').select('count', { count: 'exact', head: true });
    
    // If the error is network related, throw it.
    if (error && error.message && error.message.toLowerCase().includes('fetch')) {
      throw error;
    }

    return { success: true };
  } catch (err: any) {
    console.error("Connection Test Failed:", err);
    return { 
      success: false, 
      message: err.message || "Could not connect to Supabase. Check internet or Ad Blockers." 
    };
  }
};