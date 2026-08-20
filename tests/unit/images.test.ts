import { describe, it, expect, vi, afterEach } from 'vitest';
import { arrayBufferToBase64, fetchImageAsDataUrl, MAX_IMAGE_BYTES } from '@/lib/images';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('arrayBufferToBase64', () => {
  it('encodes bytes correctly', () => {
    const buf = new TextEncoder().encode('hello').buffer as ArrayBuffer;
    expect(arrayBufferToBase64(buf)).toBe(btoa('hello'));
  });

  it('handles buffers larger than one chunk', () => {
    const big = new Uint8Array(0x8000 + 17).fill(65);
    const encoded = arrayBufferToBase64(big.buffer as ArrayBuffer);
    expect(atob(encoded)).toHaveLength(big.length);
  });
});

describe('fetchImageAsDataUrl', () => {
  it('passes data URLs through untouched', async () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    expect(await fetchImageAsDataUrl(dataUrl)).toBe(dataUrl);
  });

  it('fetches and encodes an image with its content type', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })),
    );
    const url = await fetchImageAsDataUrl('https://example.com/x.jpg');
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('rejects oversized images', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(MAX_IMAGE_BYTES + 1))),
    );
    await expect(fetchImageAsDataUrl('https://example.com/big.png')).rejects.toThrow(
      /too large/,
    );
  });

  it('surfaces HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchImageAsDataUrl('https://example.com/gone.png')).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
