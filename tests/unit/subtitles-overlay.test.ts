import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeCue,
  readCueFromDom,
  isYouTubeWatchPage,
} from '@/entrypoints/content/subtitles';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('normalizeCue', () => {
  it('collapses whitespace so repeated cues hit the translation cache', () => {
    expect(normalizeCue('  Hello\n  world  ')).toBe('Hello world');
    expect(normalizeCue('Hello world')).toBe(normalizeCue('Hello\nworld'));
  });
});

describe('readCueFromDom', () => {
  it('joins caption segments in order', () => {
    document.body.innerHTML = `
      <div class="ytp-caption-window-container">
        <span class="ytp-caption-segment">Hello there,</span>
        <span class="ytp-caption-segment">how are you?</span>
      </div>`;
    expect(readCueFromDom()).toBe('Hello there, how are you?');
  });

  it('returns an empty string when no captions are rendered', () => {
    expect(readCueFromDom()).toBe('');
  });
});

describe('isYouTubeWatchPage', () => {
  it('matches youtube.com and subdomains only', () => {
    expect(isYouTubeWatchPage({ hostname: 'www.youtube.com' })).toBe(true);
    expect(isYouTubeWatchPage({ hostname: 'youtube.com' })).toBe(true);
    expect(isYouTubeWatchPage({ hostname: 'm.youtube.com' })).toBe(true);
    expect(isYouTubeWatchPage({ hostname: 'notyoutube.com' })).toBe(false);
    expect(isYouTubeWatchPage({ hostname: 'youtube.com.evil.example' })).toBe(false);
  });
});
