import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COUNTRY_CACHE_KEY = '@canyouguess_country';

export interface UserCountry {
  code: string;   // ISO 3166-1 alpha-2, e.g. "US"
  name: string;   // e.g. "United States"
  flag: string;   // flag emoji e.g. "🇺🇸"
  label: string;  // "🇺🇸 United States"
}

function countryCodeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join('');
}

/**
 * Detects the user's country via IP-based geolocation (no permission required).
 * Falls back to null on any failure.
 */
export async function detectCountryByIP(): Promise<UserCountry | null> {
  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(COUNTRY_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as UserCountry;
    }

    // ipapi.co — free tier, no API key needed, HTTPS, returns JSON
    const res = await fetch('https://ipapi.co/json/', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ipapi.co returned ${res.status}`);

    const json = await res.json();
    const code: string = json.country_code ?? '';
    const name: string = json.country_name ?? json.country ?? '';

    if (!code || code.length !== 2) return null;

    const flag = countryCodeToFlag(code);
    const result: UserCountry = {
      code: code.toUpperCase(),
      name,
      flag,
      label: `${flag} ${name}`,
    };

    await AsyncStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify(result));
    return result;
  } catch (err) {
    console.warn('[useUserCountry] IP detection failed:', err);
    return null;
  }
}

/**
 * React hook — resolves country automatically on mount.
 * No location permission is ever requested.
 */
export function useUserCountry(): {
  country: UserCountry | null;
  loading: boolean;
  permissionDenied: false;
  requestCountry: () => Promise<void>;
} {
  const [country, setCountry] = useState<UserCountry | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveCountry = async () => {
    setLoading(true);
    const result = await detectCountryByIP();
    setCountry(result);
    setLoading(false);
  };

  useEffect(() => {
    resolveCountry();
  }, []);

  // permissionDenied is always false — IP detection needs no permission
  return { country, loading, permissionDenied: false, requestCountry: resolveCountry };
}
