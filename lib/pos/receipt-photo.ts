import * as ImagePicker from 'expo-image-picker';

/**
 * A photo of a paid-in or paid-out receipt (POS app step 3, UX spec §7.3, §13.5), from the library
 * (`app.photo.library`) or the camera (`app.photo.camera`, over the air: the image-picker camera has
 * been in the binaries since 1.1.2). The camera is asked for first on both platforms: iOS needs it,
 * and Android refuses the camera to an app that declares CAMERA without holding it. Library picks
 * go straight to the system picker, as the app's other image uploads do (no storage permission).
 *
 * Answers the file, `denied` when camera access is off (`app.photo.denied`), or null when the
 * person backed out.
 */
export async function pickReceiptPhoto(
  source: 'library' | 'camera',
): Promise<{ uri: string; mimeType: string } | 'denied' | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.7 });
  }
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.uri) return null;
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}
