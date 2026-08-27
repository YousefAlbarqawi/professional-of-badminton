// Filled in once, at deploy time — see store/README.md's release checklist,
// "Password reset page" step. These are the PUBLIC url and anon key for
// pob-prod: the anon key is meant to be public, Row Level Security is the
// boundary (BUILD-SPEC section 7), and this page never touches anything else.
//
// Local dev's password reset is unaffected by this file: the local Supabase
// stack's site_url in supabase/config.toml still points at 127.0.0.1, and
// nobody resets a password on a real phone against a local stack.
window.POB_SUPABASE_URL = 'https://qkxzrbxgloirlrhmurbh.supabase.co';
window.POB_SUPABASE_ANON_KEY = 'sb_publishable_n1UhXZHiHkfzzRGJ27hSjg_zKglj4gZ';
