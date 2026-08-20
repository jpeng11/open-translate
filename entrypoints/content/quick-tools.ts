/**
 * Phase 3 quick tools: selection translation panel, Alt+hover block
 * translation, and triple-Space input-box translation.
 */
import { browser } from 'wxt/browser';
import { getSettings } from '@/lib/settings';
import type { SnippetResponse } from '@/lib/messaging';
import { BLOCK_SELECTOR, ensureStyles, injectTranslation, isTranslatableBlock, markError } from './dom';

async function translateSnippets(texts: string[]): Promise<SnippetResponse> {
  try {
    return (await browser.runtime.sendMessage({
      type: 'translateSnippets',
      texts,
    })) as SnippetResponse;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// --- selection translation ---------------------------------------------------

let trigger: HTMLButtonElement | null = null;
let panel: HTMLDivElement | null = null;

function removeSelectionUi() {
  trigger?.remove();
  trigger = null;
  panel?.remove();
  panel = null;
}

function clampToViewport(x: number, y: number, width: number) {
  return {
    left: Math.min(Math.max(x, 8), window.innerWidth - width - 8),
    top: Math.min(Math.max(y, 8), window.innerHeight - 48),
  };
}

async function showSelectionPanel(text: string, rect: DOMRect) {
  removeSelectionUi();
  ensureStyles();
  panel = document.createElement('div');
  panel.id = 'ot-sel-panel';
  panel.textContent = 'Translating…';
  const pos = clampToViewport(rect.left, rect.bottom + 8, 380);
  panel.style.left = `${pos.left}px`;
  panel.style.top = `${pos.top}px`;
  document.body.appendChild(panel);

  const res = await translateSnippets([text]);
  if (!panel) return; // dismissed while waiting
  panel.textContent = res.ok ? (res.translations[0] ?? '') : `⚠ ${res.message}`;
}

function initSelectionTool() {
  document.addEventListener('mouseup', (e) => {
    if (e.target instanceof Element && e.target.closest('#ot-sel-trigger, #ot-sel-panel')) return;
    // Let the browser finalize the selection first.
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      removeSelectionUi();
      if (!text || text.length > 3000 || !sel || sel.rangeCount === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      ensureStyles();
      trigger = document.createElement('button');
      trigger.id = 'ot-sel-trigger';
      trigger.textContent = '⇄ Translate';
      const pos = clampToViewport(rect.right + 4, rect.bottom + 6, 110);
      trigger.style.left = `${pos.left}px`;
      trigger.style.top = `${pos.top}px`;
      // Prevent the click from collapsing the selection before we read it.
      trigger.addEventListener('mousedown', (ev) => ev.preventDefault());
      trigger.addEventListener('click', () => void showSelectionPanel(text, rect));
      document.body.appendChild(trigger);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target instanceof Element && e.target.closest('#ot-sel-trigger, #ot-sel-panel')) return;
    removeSelectionUi();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeSelectionUi();
  });
}

// --- Alt+hover block translation ----------------------------------------------

let hoverTarget: EventTarget | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function hoverCandidate(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const block = target.closest<HTMLElement>(BLOCK_SELECTOR);
  return block && isTranslatableBlock(block) ? block : null;
}

async function translateHoveredBlock(block: HTMLElement) {
  if (block.dataset.otState) return;
  block.dataset.otState = 'pending';
  ensureStyles();
  const settings = await getSettings();
  const res = await translateSnippets([block.innerText.trim()]);
  if (res.ok) {
    delete block.dataset.otState;
    injectTranslation(block, res.translations[0] ?? '', settings.displayMode);
  } else {
    markError(block, res.message);
  }
}

function initHoverTool() {
  document.addEventListener('mousemove', (e) => {
    hoverTarget = e.target;
    if (!e.altKey) return;
    const block = hoverCandidate(e.target);
    if (!block) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => void translateHoveredBlock(block), 250);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Alt' || e.repeat) return;
    const block = hoverCandidate(hoverTarget);
    if (block) void translateHoveredBlock(block);
  });
}

// --- triple-Space input translation ---------------------------------------------

type EditableEl = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function editableTarget(t: EventTarget | null): EditableEl | null {
  if (t instanceof HTMLInputElement) {
    return ['text', 'search', 'url', 'email'].includes(t.type) ? t : null;
  }
  if (t instanceof HTMLTextAreaElement) return t;
  if (t instanceof HTMLElement && t.isContentEditable) return t;
  return null;
}

async function translateInputBox(el: EditableEl) {
  const isFormField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const raw = isFormField ? el.value : (el.textContent ?? '');
  const text = raw.replace(/\s+$/, '');
  if (text.length < 2) return;

  el.style.opacity = '0.5';
  const res = await translateSnippets([text]);
  el.style.opacity = '';
  if (!res.ok) return;

  const out = res.translations[0] ?? text;
  if (isFormField) {
    el.value = out;
  } else {
    el.textContent = out;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function initInputTool() {
  let spaceTimes: number[] = [];
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== ' ' || e.repeat) return;
      const el = editableTarget(e.target);
      if (!el) {
        spaceTimes = [];
        return;
      }
      const now = Date.now();
      spaceTimes = [...spaceTimes.filter((t) => now - t < 600), now];
      if (spaceTimes.length >= 3) {
        spaceTimes = [];
        void translateInputBox(el);
      }
    },
    true,
  );
}

export function initQuickTools() {
  initSelectionTool();
  initHoverTool();
  initInputTool();
}
