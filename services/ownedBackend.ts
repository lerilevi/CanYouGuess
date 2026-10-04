import { getSupabaseClient } from '@/template';
import { assertCurrentIdentity, captureIdentity, IdentityScope } from './identityScope';

export class BackendError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Pin both project and JWT before dispatch: a late A request must never use B's session. */
export async function ownedRequest<T>(path: string, init: RequestInit = {}, scope = captureIdentity()): Promise<T> {
  assertCurrentIdentity(scope);
  const { data: { session }, error } = await getSupabaseClient().auth.getSession();
  assertCurrentIdentity(scope);
  if (error || session?.user.id !== scope.userId) throw new BackendError(401, 'Please sign in again.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${scope.project}${path}`, {
      ...init, signal: controller.signal,
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', 'Content-Type': 'application/json',
        ...init.headers, Authorization: `Bearer ${session.access_token}` },
    });
    const data = await response.json();
    assertCurrentIdentity(scope);
    if (!response.ok) throw new BackendError(response.status, data.error ?? data.message ?? 'Request failed.');
    return data as T;
  } finally { clearTimeout(timeout); }
}
export const ownedRpc = <T>(name: string, body: Record<string, unknown> = {}, scope?: IdentityScope) =>
  ownedRequest<T>(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, scope);
