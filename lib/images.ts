/** Image fetching + encoding for vision-model translation. */

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000; // String.fromCharCode arg limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Fetch an image and return it as a data URL suitable for an OpenAI-style image_url part. */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the image (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large to translate (6 MB limit).');
  }
  const type = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return `data:${type};base64,${arrayBufferToBase64(buf)}`;
}
