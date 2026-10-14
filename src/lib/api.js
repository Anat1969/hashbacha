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
    err.readonly = /hb_readonly/.test(error.message || '');
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
  replaceAll: (key, projects) => rpc('hb_replace_all', { p_key: key, p_projects: projects }),

  // Appraisal review module
  reviewOpen: (key, projectId, opinionId, actor) => rpc('hb_review_open', { p_key: key, p_project: projectId, p_opinion: opinionId || null, p_actor: actor || '' }),
  reviewGet: (key, id) => rpc('hb_review_get', { p_key: key, p_review: id }),
  reviewFile: (key, fileId) => rpc('hb_review_file', { p_key: key, p_file: fileId }),
  reviewImport: (key, id, slot, file, parsed, actor) => rpc('hb_review_import', { p_key: key, p_review: id, p_slot: slot, p_file: file, p_parsed: parsed, p_actor: actor || '' }),
  reviewSetRef: (key, id, row, value, src, actor) => rpc('hb_review_set_ref', { p_key: key, p_review: id, p_row: row, p_value: value, p_src: src || '', p_actor: actor || '' }),
  reviewMark: (key, id, row, verdict, comment, actor) => rpc('hb_review_mark', { p_key: key, p_review: id, p_row: row, p_verdict: verdict, p_comment: comment || '', p_actor: actor || '' }),
  reviewStatus: (key, id, status, note, actor) => rpc('hb_review_status', { p_key: key, p_review: id, p_status: status, p_note: note || {}, p_actor: actor || '' }),
  reviewNewRound: (key, id, actor) => rpc('hb_review_new_round', { p_key: key, p_review: id, p_actor: actor || '' }),
  reviewApprove: (key, id, actor) => rpc('hb_review_approve', { p_key: key, p_review: id, p_actor: actor || '' })
};
