// Publishable values: safe in the browser. All data access is gated server-side by hb_* functions.
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://cbhexpybdggwzyakgagd.supabase.co';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY || 'sb_publishable_1KSwG6rqTzBSHmI2RxX6Fw_EEcuKzk3';
export const KEY_STORAGE = 'hashbacha-access-key';
export const PROFIT_THRESHOLD = 15;
