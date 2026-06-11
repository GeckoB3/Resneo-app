import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';

import { apiFetch, ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

interface UploadImageResponse {
  url: string;
}

async function uploadImageToRoute(
  route: '/api/venue/logo' | '/api/venue/cover',
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

/** Pick an image from the device library using expo-document-picker. */
export async function pickVenueImage(): Promise<{ uri: string; mimeType: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const mimeType = asset.mimeType ?? 'image/jpeg';
  return { uri: asset.uri, mimeType };
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
