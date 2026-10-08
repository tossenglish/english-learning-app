import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { apiFetch } from '@/lib/api-fetch';

export function useAdminAccess() {
  const { isLoaded, isSignedIn } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setIsAdmin(false);
      setIsChecking(false);
      return;
    }

    const controller = new AbortController();
    setIsChecking(true);
    apiFetch('/api/admin/status', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { isAdmin: false };
        return response.json() as Promise<{ isAdmin: boolean }>;
      })
      .then(({ isAdmin: allowed }) => setIsAdmin(allowed))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setIsAdmin(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsChecking(false);
      });

    return () => controller.abort();
  }, [isLoaded, isSignedIn]);

  return { isAdmin, isChecking };
}