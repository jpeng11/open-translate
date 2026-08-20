import type { Settings } from './settings';

/** Long-lived port name; keeping it open also keeps the MV3 worker alive during translation. */
export const TRANSLATE_PORT = 'ot-translate';

// Content script → background (over the port)
export interface TranslateRequest {
  type: 'translate';
  id: number;
  texts: string[];
}

// Background → content script (over the port)
export type TranslateResponse =
  | { type: 'result'; id: number; translations: string[] }
  | { type: 'error'; id: number; message: string };

// Background → content: progress of a context-menu image translation
export type ImageTranslationMessage =
  | { type: 'imageTranslation'; status: 'pending'; srcUrl: string }
  | { type: 'imageTranslation'; status: 'done'; srcUrl: string; text: string }
  | { type: 'imageTranslation'; status: 'error'; srcUrl: string; message: string };

// One-shot runtime messages
export type RuntimeMessage =
  | { type: 'testConnection'; settings: Settings }
  | { type: 'translateSnippets'; texts: string[] }
  | { type: 'translatePage' }
  | { type: 'restorePage' }
  | { type: 'getPageState' }
  | ImageTranslationMessage;

export type SnippetResponse =
  | { ok: true; translations: string[] }
  | { ok: false; message: string };

export interface PageState {
  translated: boolean;
  translating: boolean;
  blocksTranslated: number;
}
