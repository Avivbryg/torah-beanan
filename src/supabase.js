import { createClient } from "@supabase/supabase-js";

/* The publishable key is meant for the browser; access is enforced by Row Level Security in the database. */
export const SUPABASE_URL = "https://ujocyvzvwzielrjzvjok.supabase.co";
export const SUPABASE_KEY = "sb_publishable_Dk2j-FSAndFAhLWWF4dASQ_nKY38Omo";

/* PKCE puts the sign-in code in ?code=, leaving #issue links in the hash alone. */
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: "pkce" } });
