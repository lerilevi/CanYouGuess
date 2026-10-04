/** Identity ownership shared by auth, async services and the keyed UI tree. */
export interface IdentityScope { project: string; userId: string | null; generation: number }
const project = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'unconfigured').trim().replace(/\/+$/, '').toLowerCase();
let current: IdentityScope = { project, userId: null, generation: 0 };
const listeners = new Set<() => void>();

export class StaleIdentityError extends Error {
  constructor() { super('The active player changed. Please retry for the current player.'); }
}
export const getIdentityScope = () => current;
export const subscribeIdentity = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setIdentity(userId: string | null, force = false): IdentityScope {
  if (!force && current.userId === userId) return current;
  current = { project, userId, generation: current.generation + 1 };
  listeners.forEach(listener => listener());
  return current;
}
export const beginIdentityTransition = () => setIdentity(null, true);
export const identityKey = (scope: IdentityScope) => `${scope.project}:${scope.userId ?? 'signed-out'}:${scope.generation}`;
export const isCurrentIdentity = (scope: IdentityScope) => scope === current && scope.userId !== null;
export function assertCurrentIdentity(scope: IdentityScope): void {
  if (!isCurrentIdentity(scope)) throw new StaleIdentityError();
}
export function captureIdentity(expectedUserId?: string): IdentityScope {
  const scope = current;
  assertCurrentIdentity(scope);
  if (expectedUserId && scope.userId !== expectedUserId) throw new StaleIdentityError();
  return scope;
}
export const userCacheKey = (scope: IdentityScope, name: string) =>
  `@canyouguess:v2:${encodeURIComponent(scope.project)}:${encodeURIComponent(scope.userId ?? 'signed-out')}:${name}`;
