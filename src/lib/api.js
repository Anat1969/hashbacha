import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    const err = new Error(error.message || 'rpc_error');
    err.forbidden = /hb_forbidden/.test(error.message || '') || error.code === '42501';
    throw err;
  }
  return data;
}

export const api = {
  check: (key) => rpc('hb_check', { p_key: key }),
  load: (key) => rpc('hb_load', { p_key: key }),
  saveProject: (key, id, data) => rpc('hb_upsert_project', { p_key: key, p_id: id || null, p_data: data }),
  removeProject: (key, id) => rpc('hb_remove_project', { p_key: key, p_id: id }),
  restoreProject: (key, id) => rpc('hb_restore_project', { p_key: key, p_id: id }),
  saveOpinion: (key, projectId, id, data) =>
    rpc('hb_upsert_opinion', { p_key: key, p_project: projectId, p_id: id || null, p_data: data }),
  removeOpinion: (key, id) => rpc('hb_remove_opinion', { p_key: key, p_id: id }),
  saveSettings: (key, settings) => rpc('hb_save_settings', { p_key: key, p_settings: settings }),
  saveNote: (key, id, data) => rpc('hb_upsert_note', { p_key: key, p_id: id || null, p_data: data }),
  removeNote: (key, id) => rpc('hb_remove_note', { p_key: key, p_id: id }),
  replaceAll: (key, projects) => rpc('hb_replace_all', { p_key: key, p_projects: projects })
};
