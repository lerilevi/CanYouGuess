import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertCurrentIdentity, IdentityScope, userCacheKey } from './identityScope';

// No unowned v1 data is imported into a player's cache or authoritative ledger.
const names = ['ai-notice-v1', 'question-history', 'question-preference'];
const queues = new Map<string, Promise<unknown>>();
function ordered<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
export async function readUserCache<T>(scope: IdentityScope, name: string): Promise<T | null> {
  assertCurrentIdentity(scope);
  const raw = await AsyncStorage.getItem(userCacheKey(scope, name));
  assertCurrentIdentity(scope);
  try {
    const entry = raw ? JSON.parse(raw) : null;
    return entry?.project === scope.project && entry?.userId === scope.userId ? entry.value as T : null;
  } catch { return null; }
}
export async function writeUserCache<T>(scope: IdentityScope, name: string, value: T): Promise<void> {
  const key = userCacheKey(scope, name);
  await ordered(key, async () => {
    assertCurrentIdentity(scope);
    await AsyncStorage.setItem(key, JSON.stringify({ project: scope.project, userId: scope.userId, value }));
  });
  assertCurrentIdentity(scope);
}
export async function updateUserCache<T>(scope: IdentityScope, name: string, update: (value: T | null) => T): Promise<void> {
  await ordered(userCacheKey(scope, name), async () => {
    const previous = await readUserCache<T>(scope, name);
    assertCurrentIdentity(scope);
    await AsyncStorage.setItem(userCacheKey(scope, name), JSON.stringify({
      project: scope.project, userId: scope.userId, value: update(previous),
    }));
  });
  assertCurrentIdentity(scope);
}
export async function clearUserCaches(scope: IdentityScope): Promise<void> {
  if (!scope.userId) return;
  await Promise.all(names.map(name => {
    const key = userCacheKey(scope, name);
    return ordered(key, () => AsyncStorage.removeItem(key));
  }));
}
