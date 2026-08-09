import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { apiFetch, ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

interface UploadImageResponse {
  url: string;
}

type ImageUploadRoute =
  | '/api/venue/logo'
  | '/api/venue/cover'
  | '/api/venue/gallery'
  | '/api/venue/team-photo'
  | '/api/venue/service-photo';

async function uploadImageToRoute(
  route: ImageUploadRoute,
  fileUri: string,
  mimeType: string,
  accessToken: string,
): Promise<string> {
  const formData = new FormData();
  // React Native accepts a { uri, name, type } object for FormData
  formData.append('file', {
    uri: fileUri,
    name: `upload.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`,
    type: mimeType,
  } as unknown as Blob);

  const url = `${getApiUrl()}${route}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Do NOT set Content-Type here — browser/RN will set it with boundary
    },
    body: formData,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(`Unexpected response from ${route}`, response.status);
  }

  if (!response.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Upload failed (${response.status})`;
    throw new ApiError(msg, response.status, data);
  }

  const { url: imageUrl } = data as UploadImageResponse;
  if (!imageUrl) throw new ApiError('No URL returned from upload', 200);
  return imageUrl;
}

/**
 * Pick an image from the device's photo library.
 *
 * Uses expo-image-picker, NOT a document picker. `getDocumentAsync` presents
 * UIDocumentPickerViewController on iOS, which browses iCloud Drive / On My
 * iPhone / third-party providers — the Photos library is not a file provider
 * there, so every image upload in the app (logo, cover, gallery, team and
 * service photos: nine entry points) opened a Files browser that simply did not
 * contain the user's photos. Compounding it, iPhone photos are HEIC, which was
 * not in the accepted type list, so even one exported to Files was greyed out.
 *
 * The library picker also transcodes HEIC to JPEG on the way out, so the upload
 * routes keep receiving a format they accept. Android is unaffected either way,
 * and does NOT need READ_MEDIA_IMAGES — expo-image-picker uses the system photo
 * picker on Android 13+, which is why that permission stays blocked in app.json.
 *
 * Returns the same `{ uri, mimeType }` contract as before, so callers are
 * unchanged; `null` means the user cancelled or denied access.
 */
export async function pickVenueImage(): Promise<{ uri: string; mimeType: string } | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // The upload routes take a single file; multiple selection has no consumer.
    allowsMultipleSelection: false,
    // Full-quality re-encode. These are venue branding images shown on a public
    // booking page, so compressing them here would be visible.
    quality: 1,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  if (!asset?.uri) return null;

  // iOS reports HEIC assets as image/heic only when handed over untranscoded;
  // the default path yields JPEG. Fall back rather than send an empty type.
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/** Upload venue logo to POST /api/venue/logo; PATCHes logo_url back to /api/venue. */
export function useUploadVenueLogo() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      const logoUrl = await uploadImageToRoute('/api/venue/logo', uri, mimeType, accessToken);
      // Persist the returned URL back to the venue record
      await apiFetch('/api/venue', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ logo_url: logoUrl }),
      });
      return logoUrl;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}

/**
 * Booking-page photo uploaders — each POSTs the image to its storage route and
 * returns the public URL. They do NOT touch the venue record: the caller writes
 * the returned URL into `booking_page_config` (gallery / service_photos /
 * team_profiles) via `useUpdateBookingPageConfig`, then that PATCH refreshes the
 * venue. (Routes are admin-only + Bearer.)
 */
export function useUploadGalleryPhoto() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      return uploadImageToRoute('/api/venue/gallery', uri, mimeType, accessToken);
    },
  });
}

export function useUploadTeamPhoto() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      return uploadImageToRoute('/api/venue/team-photo', uri, mimeType, accessToken);
    },
  });
}

export function useUploadServicePhoto() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      return uploadImageToRoute('/api/venue/service-photo', uri, mimeType, accessToken);
    },
  });
}

/** DELETE /api/venue/service-photo — removes the storage object for a service photo URL. */
export function useDeleteServicePhoto() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (url: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch('/api/venue/service-photo', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ url }),
      });
    },
  });
}

/** Upload venue cover photo to POST /api/venue/cover; PATCHes cover_photo_url back to /api/venue. */
export function useUploadVenueCover() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      const coverUrl = await uploadImageToRoute('/api/venue/cover', uri, mimeType, accessToken);
      await apiFetch('/api/venue', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ cover_photo_url: coverUrl }),
      });
      return coverUrl;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}
