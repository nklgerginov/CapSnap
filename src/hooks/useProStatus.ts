import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'capsnap_pro_status';

/**
 * Stripe Payment Link used to unlock CapSnap Pro.
 *
 * NOTE: This is currently a Stripe *test mode* link (buy.stripe.com/test_...),
 * so no real charge will occur. Swap in the live payment link before shipping
 * this to real customers.
 *
 * For the automatic unlock-on-return flow below to work, configure this
 * Payment Link's "After payment" redirect (in the Stripe Dashboard) to point
 * back at this app's deployed URL with `?upgrade=success` appended, e.g.
 * `https://your-app-url.example.com/?upgrade=success`.
 */
export const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/test_3cI14hf2mdjG87W81c5J600';

interface ProStatus {
  isPro: boolean;
  unlockedAt: number | null;
}

const DEFAULT_STATUS: ProStatus = { isPro: false, unlockedAt: null };

function readStoredStatus(): ProStatus {
  if (typeof window === 'undefined') return DEFAULT_STATUS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATUS;
    const parsed = JSON.parse(raw);
    return {
      isPro: !!parsed.isPro,
      unlockedAt: typeof parsed.unlockedAt === 'number' ? parsed.unlockedAt : null,
    };
  } catch {
    return DEFAULT_STATUS;
  }
}

function writeStoredStatus(status: ProStatus) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // localStorage unavailable (private browsing, storage full, etc).
    // Pro unlock will still work for this session but won't persist.
  }
}

/**
 * Tracks whether the current browser has unlocked CapSnap Pro.
 *
 * This is a soft, client-side unlock appropriate for a fully client-side app
 * with no backend/user accounts: it is not a hard license/DRM system, it just
 * removes the free-tier watermark & format/resolution caps once someone has
 * paid, and remembers that across reloads via localStorage (synced across
 * same-origin tabs via the `storage` event).
 *
 * Unlock flow:
 *  1. User clicks "Upgrade to Pro" -> opens the Stripe Payment Link.
 *  2. Stripe redirects back to this app with `?upgrade=success` (once that
 *     redirect is configured on the Payment Link in the Stripe Dashboard).
 *  3. This hook detects that query param, marks Pro unlocked in
 *     localStorage, and strips the param from the URL.
 */
export function useProStatus() {
  const [status, setStatus] = useState<ProStatus>(() => readStoredStatus());

  // Detect return-from-Stripe redirect.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      const next: ProStatus = { isPro: true, unlockedAt: Date.now() };
      writeStoredStatus(next);
      setStatus(next);

      params.delete('upgrade');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Keep Pro status in sync across tabs (e.g. payment completed in a new tab).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setStatus(readStoredStatus());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const unlockPro = useCallback(() => {
    const next: ProStatus = { isPro: true, unlockedAt: Date.now() };
    writeStoredStatus(next);
    setStatus(next);
  }, []);

  const resetPro = useCallback(() => {
    writeStoredStatus(DEFAULT_STATUS);
    setStatus(DEFAULT_STATUS);
  }, []);

  return { isPro: status.isPro, unlockedAt: status.unlockedAt, unlockPro, resetPro };
}
