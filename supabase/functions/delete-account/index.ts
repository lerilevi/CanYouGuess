import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Identify the calling user from their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Use a user-scoped client just to verify the token / get the user id
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the service-role client to delete all user data directly from the DB.
    // Deletion order respects FK constraints:
    //   category_scores, leaderboard_scores, user_badges, user_stats → user_profiles
    // Deleting user_profiles last cleans up the root row; all child rows are
    // removed first to avoid FK violations in case cascades aren't in effect.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const tables = ['category_scores', 'leaderboard_scores', 'user_badges', 'user_stats', 'user_profiles'];
    for (const table of tables) {
      const { error: delErr } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(table === 'user_profiles' ? 'id' : 'user_id', user.id);

      if (delErr) {
        console.error(`[delete-account] Failed to delete from ${table}:`, delErr.message);
        return new Response(
          JSON.stringify({ error: `Failed to delete from ${table}: ${delErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Attempt to delete the auth user. This may fail on some hosting environments
    // (ipNotInner restriction) — treat that as a soft failure: data is already gone.
    const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authDelErr) {
      console.warn('[delete-account] auth.admin.deleteUser not available; data already purged:', authDelErr.message);
    }

    console.log(`[delete-account] Deleted all data for user ${user.id}.`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[delete-account] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
