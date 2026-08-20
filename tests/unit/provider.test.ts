import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateBatch, translateImage, testConnection } from '@/lib/provider';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Settings } from '@/lib/settings';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  apiKey: 'sk-test',
  model: 'test-model',
  targetLang: 'zh-CN',
};

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
    text: async () => message,
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('translateImage — vision-model OCR', () => {
  it('sends the image as an image_url content part', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('翻译结果'));
    const dataUrl = 'data:image/png;base64,AAAA';

    const result = await translateImage(settings, dataUrl);
    expect(result).toBe('翻译结果');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const userContent = body.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent[1]).toEqual({ type: 'image_url', image_url: { url: dataUrl } });
    expect(body.messages[0].content).toContain('简体中文');
  });
});

describe('translateBatch — locked JSON-array protocol', () => {
  it('returns translations when the model replies with a valid JSON array', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse('["你好","世界"]'));

    const result = await translateBatch(['hello', 'world'], settings);
    expect(result).toEqual(['你好', '世界']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    expect(JSON.parse(body.messages[1].content)).toEqual(['hello', 'world']);
  });

  it('sends the API key as a bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('["a"]'));
    await translateBatch(['x'], settings);
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('sends Grok proxy headers in grokOauth mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('["a"]'));
    const grokSettings: Settings = {
      ...settings,
      authMode: 'grokOauth',
      baseUrl: 'https://cli-chat-proxy.grok.com/v1',
      model: 'grok-4.6',
      grokTokens: {
        accessToken: 'grok-access',
        refreshToken: 'grok-refresh',
        expiresAt: Date.now() + 60 * 60 * 1000,
      },
    };
    await translateBatch(['x'], grokSettings);
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer grok-access');
    expect(headers['X-XAI-Token-Auth']).toBe('xai-grok-cli');
    expect(headers['x-grok-model-override']).toBe('grok-4.6');
    expect(headers['x-grok-client-version']).toBeTruthy();
    expect(headers['x-grok-client-identifier']).toBeTruthy();
  });

  it('tolerates markdown fences and prose around the JSON array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse('Sure! Here it is:\n```json\n["你好"]\n```'),
    );
    expect(await translateBatch(['hello'], settings)).toEqual(['你好']);
  });

  it('retries once when the array length does not match', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse('["only-one"]'))
      .mockResolvedValueOnce(okResponse('["一","二"]'));

    expect(await translateBatch(['one', 'two'], settings)).toEqual(['一', '二']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to per-item translation after two malformed batch replies', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse('not json at all'))
      .mockResolvedValueOnce(okResponse('still not json'))
      .mockResolvedValueOnce(okResponse('一'))
      .mockResolvedValueOnce(okResponse('二'));

    expect(await translateBatch(['one', 'two'], settings)).toEqual(['一', '二']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws with HTTP detail when the provider fails twice', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(401, 'bad key'));
    await expect(translateBatch(['x'], settings)).rejects.toThrow('HTTP 401: bad key');
  });

  it('returns an empty array for empty input without calling the network', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await translateBatch([], settings)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims trailing slashes from the base URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('["a"]'));
    await translateBatch(['x'], { ...settings, baseUrl: 'https://example.com/v1///' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://example.com/v1/chat/completions');
  });
});

describe('testConnection', () => {
  it('reports ok with a sample reply', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse('你好，世界！'));
    const result = await testConnection(settings);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('你好，世界！');
  });

  it('reports failure with the error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(403, 'forbidden'));
    const result = await testConnection(settings);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('403');
  });
});
