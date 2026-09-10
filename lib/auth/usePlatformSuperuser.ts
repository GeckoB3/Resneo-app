import { isPlatformSuperuserMetadata } from '@/lib/auth/platform-superuser';
import { useAuth } from '@/providers/AuthProvider';

/** True when the signed-in session carries the platform superuser role. Synchronous: it reads the session already in hand. */
export function usePlatformSuperuser(): boolean {
  const { session } = useAuth();
  return isPlatformSuperuserMetadata(
    (session?.user?.app_metadata ?? null) as Record<string, unknown> | null,
  );
}
