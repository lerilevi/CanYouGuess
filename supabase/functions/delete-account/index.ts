// Edge Function: delete-account
//
// Rewritten for the self-owned Supabase project. On OnSpace Cloud,
// `auth.admin.deleteUser` was blocked by an "internal network only"
// restriction, so the old version deleted the user's rows table-by-table and
// left the auth account orphaned — the user could still log in and would be
// handed a blank profile.
//
// Here we delete the auth user itself. Every table references
// `auth.users(id) ON DELETE CASCADE` (see migration 0001), so one delete
// removes every application row atomically, including private question state
// and request-limit events, with no ordering to keep in sync as the schema
// grows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders } from '../_shared/cors.ts';

interface DeleteRequest {
  /** Must equal "DELETE" — guards against an accidental invoke. */
  confirm?: string;
}

const MAX_REQUEST_BYTES = 1_024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function readRequest(req: Request): Promise<DeleteRequest> {
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!bytes.length) return {};
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as DeleteRequest;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401);
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Request body too large' }, 413);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Fail loudly rather than falling back to '' and producing a confusing 401.
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[delete-account] Missing required environment variables.');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const token = authHeader.slice('Bearer '.length);

    // Resolve the caller from their own JWT. Never trust a user id from the
    // request body — that would let any signed-in user delete anyone.
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    let body: DeleteRequest;
    try {
      body = await readRequest(req);
    } catch (error) {
      if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
        return json({ error: 'Request body too large' }, 413);
      }
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (body.confirm !== 'DELETE') {
      return json({ error: 'Confirmation required' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Single delete; ON DELETE CASCADE fans out to every dependent table.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error(`[delete-account] Failed to delete auth user ${user.id}:`, deleteError.message);
      return json({ error: 'Account deletion failed. Please contact support.' }, 500);
    }

    // Verify rather than assume — if a future table is added without a cascade
    // this surfaces as a loud log line instead of silently orphaned data.
    const { data: leftover, error: verificationError } = await supabaseAdmin
      .rpc('account_data_exists', { p_user_id: user.id });

    if (verificationError) {
      console.error(`[delete-account] Could not verify cascades for ${user.id}:`, verificationError.message);
    } else if (leftover === true) {
      console.error(`[delete-account] Application rows survived deletion of ${user.id} — check FK cascades.`);
    }

    console.log(`[delete-account] Deleted auth user ${user.id} and all cascaded data.`);
    return json({ success: true }, 200);
  } catch (err) {
    console.error('[delete-account] Unexpected error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
