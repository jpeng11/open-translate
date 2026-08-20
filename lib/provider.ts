import type { Settings } from './settings';
import { languageLabel } from './settings';
import {
  ensureFreshAccessToken,
  GROK_CLIENT_VERSION,
  GROK_CLIENT_IDENTIFIER,
} from './grokAuth';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

async function buildHeaders(settings: Settings): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.authMode === 'grokOauth') {
    const accessToken = await ensureFreshAccessToken(settings);
    headers.Authorization = `Bearer ${accessToken}`;
    // The Grok CLI proxy validates session tokens via this header and
    // routes by the model-override header rather than the JSON body.
    headers['X-XAI-Token-Auth'] = 'xai-grok-cli';
    headers['x-grok-model-override'] = settings.model;
    // Without a client version the proxy rejects requests outright
    // (verified live: adding this header is what makes inference work).
    headers['x-grok-client-version'] = GROK_CLIENT_VERSION;
    headers['x-grok-client-identifier'] = GROK_CLIENT_IDENTIFIER;
  } else if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  return headers;
}

async function chatCompletion(settings: Settings, messages: ChatMessage[]): Promise<string> {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = await buildHeaders(settings);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.2 }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body).slice(0, 200);
    } catch {
      detail = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Provider returned no message content');
  return content;
}

/** Extract a JSON string array from model output; tolerate markdown fences and prose around it. */
function parseJsonStringArray(content: string): string[] | null {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((item) => typeof item === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function batchMessages(texts: string[], settings: Settings): ChatMessage[] {
  const lang = `${languageLabel(settings.targetLang)} (${settings.targetLang})`;
  return [
    {
      role: 'system',
      content:
        `You are a professional translator. The user sends a JSON array of strings. ` +
        `Translate each string into ${lang}. ` +
        `Reply with ONLY a JSON array of the translated strings, exactly the same length and order as the input. ` +
        `Keep numbers, URLs, code identifiers, and proper nouns intact where appropriate. ` +
        `If a string is already in ${lang}, return it unchanged. No explanations, no markdown fences.`,
    },
    { role: 'user', content: JSON.stringify(texts) },
  ];
}

async function translateOne(text: string, settings: Settings): Promise<string> {
  const lang = `${languageLabel(settings.targetLang)} (${settings.targetLang})`;
  const content = await chatCompletion(settings, [
    {
      role: 'system',
      content: `Translate the user's text into ${lang}. Reply with only the translation, nothing else.`,
    },
    { role: 'user', content: text },
  ]);
  return content.trim();
}

/**
 * Locked batch protocol: JSON array in → same-length JSON array out.
 * Index-validated; one retry on mismatch, then per-item fallback.
 */
export async function translateBatch(texts: string[], settings: Settings): Promise<string[]> {
  if (texts.length === 0) return [];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await chatCompletion(settings, batchMessages(texts, settings));
      const parsed = parseJsonStringArray(content);
      if (parsed && parsed.length === texts.length) return parsed;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }

  // Batch protocol failed twice — translate items individually.
  const results: string[] = [];
  for (const text of texts) {
    results.push(await translateOne(text, settings));
  }
  return results;
}

/**
 * Extract and translate text in an image using the user's own vision-capable
 * model — the BYO-model take on OCR (no bundled Tesseract, no third-party OCR).
 */
export async function translateImage(settings: Settings, imageDataUrl: string): Promise<string> {
  const lang = `${languageLabel(settings.targetLang)} (${settings.targetLang})`;
  const content = await chatCompletion(settings, [
    {
      role: 'system',
      content:
        `Extract all text from the user's image and translate it into ${lang}. ` +
        `Preserve the reading order and use line breaks to reflect the layout. ` +
        `Reply with only the translated text. If the image contains no text, reply exactly: (no text found)`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Extract and translate the text in this image into ${lang}.` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]);
  return content.trim();
}

export async function testConnection(
  settings: Settings,
): Promise<{ ok: boolean; message: string }> {
  try {
    const sample = await translateOne('Hello, world!', settings);
    return { ok: true, message: `Model replied: ${sample.slice(0, 80)}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
