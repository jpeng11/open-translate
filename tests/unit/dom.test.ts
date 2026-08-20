import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isTranslatableBlock,
  collectBlocks,
  injectTranslation,
  markError,
} from '@/entrypoints/content/dom';

// happy-dom reports no client rects for detached/unstyled nodes; the
// visibility check is covered separately, so make every element "visible".
beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 20 },
  ] as unknown as DOMRectList);
});

function make(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('isTranslatableBlock', () => {
  it('accepts a plain paragraph', () => {
    expect(isTranslatableBlock(make('<p>Hello world, this is content.</p>'))).toBe(true);
  });

  it('rejects blocks inside code and pre', () => {
    const el = make('<pre><p>const x = 1;</p></pre>').querySelector('p')!;
    expect(isTranslatableBlock(el)).toBe(false);
  });

  it('rejects containers that hold nested blocks (leaf blocks only)', () => {
    const li = make('<li><p>Nested paragraph text</p></li>');
    expect(isTranslatableBlock(li)).toBe(false);
    expect(isTranslatableBlock(li.querySelector('p')!)).toBe(true);
  });

  it('rejects nearly-empty blocks', () => {
    expect(isTranslatableBlock(make('<p> </p>'))).toBe(false);
    expect(isTranslatableBlock(make('<p>x</p>'))).toBe(false);
  });

  it('rejects already-processed blocks', () => {
    const el = make('<p data-ot-state="done">Already translated text</p>');
    expect(isTranslatableBlock(el)).toBe(false);
  });

  it('rejects our own injected nodes', () => {
    const el = make('<div class="ot-translation"><p>Injected translation</p></div>');
    expect(isTranslatableBlock(el.querySelector('p')!)).toBe(false);
  });

  it('rejects invisible blocks', () => {
    const el = make('<p>Hidden but real text</p>');
    vi.spyOn(el, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    expect(isTranslatableBlock(el)).toBe(false);
  });
});

describe('collectBlocks', () => {
  it('collects only leaf blocks in document order', () => {
    document.body.innerHTML = `
      <h1>Title text</h1>
      <p>First paragraph</p>
      <ul><li>Item one</li><li><p>Item two nested</p></li></ul>
      <pre><code>skip me entirely</code></pre>
    `;
    const texts = collectBlocks().map((el) => el.textContent?.trim());
    expect(texts).toEqual(['Title text', 'First paragraph', 'Item one', 'Item two nested']);
  });
});

describe('injectTranslation', () => {
  it('appends a translation below the original in bilingual mode', () => {
    const el = make('<p>Original text here</p>');
    injectTranslation(el, '翻译', 'bilingual');
    expect(el.dataset.otState).toBe('done');
    const span = el.querySelector('.ot-translation')!;
    expect(span.textContent).toBe('翻译');
    expect(el.textContent).toContain('Original text here');
  });

  it('hides the original losslessly in translation-only mode', () => {
    const el = make('<p>Original <a href="#">link</a> text</p>');
    injectTranslation(el, '翻译', 'translationOnly');
    const wrapper = el.querySelector('.ot-original')!;
    expect(wrapper.classList.contains('ot-hidden-original')).toBe(true);
    expect(wrapper.querySelector('a')).not.toBeNull();
    expect(el.querySelector('.ot-translation')!.textContent).toBe('翻译');
  });
});

describe('markError', () => {
  it('marks the block and attaches an error chip with the message', () => {
    const el = make('<p>Some text that failed</p>');
    markError(el, 'HTTP 500');
    expect(el.dataset.otState).toBe('error');
    const chip = el.querySelector('.ot-error-chip') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.title).toBe('HTTP 500');
  });
});
