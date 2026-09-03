import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { ServiceCategoryRef } from '@/lib/booking/service-categories';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Writes to `/api/venue/service-categories` (web 2026-09-02): the headings a
 * venue groups its services under on every booking surface. Reads come with the
 * services list (`GET /api/venue/appointment-services` returns `categories`),
 * so there is no separate list hook; every write invalidates that list and the
 * public catalog, which carries the same headings to the booking picker.
 *
 * Admin-only on the server (403 otherwise); a duplicate name is a 409 with the
 * server's own message, surfaced as-is.
 */

export const CATEGORY_NAME_MAX = 80;

function invalidateCategories(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

/** POST /api/venue/service-categories — create a heading at the end of the list. */
export function useCreateServiceCategory() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<ServiceCategoryRef> => {
      if (!accessToken) throw new Error('Missing access token');
      const res = await apiFetch<{ category: ServiceCategoryRef }>('/api/venue/service-categories', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      return res.category;
    },
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/** PATCH /api/venue/service-categories — rename a heading. */
export function useRenameServiceCategory() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string }): Promise<ServiceCategoryRef> => {
      if (!accessToken) throw new Error('Missing access token');
      const res = await apiFetch<{ category: ServiceCategoryRef }>('/api/venue/service-categories', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.category;
    },
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/**
 * DELETE /api/venue/service-categories — remove a heading. Services under it
 * keep everything but the heading (`category_id` is set null on delete).
 */
export function useDeleteServiceCategory() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>('/api/venue/service-categories', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => invalidateCategories(queryClient),
  });
}

/**
 * PUT /api/venue/service-categories/reorder — the FULL id order, `sort_order =
 * index`, the same idiom as the services reorder.
 */
export function useReorderServiceCategories() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (categoryIds: string[]): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>('/api/venue/service-categories/reorder', {
        accessToken,
        method: 'PUT',
        body: JSON.stringify({ category_ids: categoryIds }),
      });
    },
    onSuccess: () => invalidateCategories(queryClient),
  });
}
