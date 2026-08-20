import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { getSettings, languageLabel } from '@/lib/settings';
import type { Settings } from '@/lib/settings';
import type { SnippetResponse } from '@/lib/messaging';
import { translateAll } from '@/lib/documents/batch';
import {
  parseSrt,
  cueText,
  serializeBilingualSrt,
  parseAssDialogueTexts,
  serializeBilingualAss,
} from '@/lib/documents/subtitles';
import {
  splitParagraphs,
  serializeBilingualTxt,
  serializeBilingualHtml,
} from '@/lib/documents/text';
import type { BilingualSection } from '@/lib/documents/text';

type Phase = 'idle' | 'extracting' | 'translating' | 'done' | 'error';

interface Output {
  filename: string;
  blob: Blob;
}

async function translateSnippets(texts: string[]): Promise<string[]> {
  const response: SnippetResponse = await browser.runtime.sendMessage({
    type: 'translateSnippets',
    texts,
  });
  if (!response.ok) throw new Error(response.message);
  return response.translations;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [output, setOutput] = useState<Output | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError('');
    setOutput(null);
    setPhase('extracting');
    setProgress({ done: 0, total: 0 });

    const onProgress = (done: number, total: number) => setProgress({ done, total });
    const ext = file.name.toLowerCase().split('.').pop() ?? '';

    try {
      let result: Output;
      if (ext === 'srt') {
        const content = await file.text();
        const cues = parseSrt(content);
        if (cues.length === 0) throw new Error('No subtitle cues found in this file.');
        setPhase('translating');
        const translations = await translateAll(cues.map(cueText), translateSnippets, onProgress);
        result = {
          filename: `${baseName(file.name)}.bilingual.srt`,
          blob: new Blob([serializeBilingualSrt(cues, translations)], { type: 'text/plain' }),
        };
      } else if (ext === 'ass') {
        const content = await file.text();
        const texts = parseAssDialogueTexts(content);
        if (texts.length === 0) throw new Error('No Dialogue lines found in this file.');
        setPhase('translating');
        const translations = await translateAll(texts, translateSnippets, onProgress);
        result = {
          filename: `${baseName(file.name)}.bilingual.ass`,
          blob: new Blob([serializeBilingualAss(content, translations)], { type: 'text/plain' }),
        };
      } else if (ext === 'txt' || ext === 'md') {
        const content = await file.text();
        const paragraphs = splitParagraphs(content);
        if (paragraphs.length === 0) throw new Error('This file contains no text.');
        setPhase('translating');
        const translations = await translateAll(paragraphs, translateSnippets, onProgress);
        result = {
          filename: `${baseName(file.name)}.bilingual.txt`,
          blob: new Blob([serializeBilingualTxt(paragraphs, translations)], {
            type: 'text/plain',
          }),
        };
      } else if (ext === 'pdf') {
        const { extractPdfPages } = await import('@/lib/documents/pdf');
        const pages = await extractPdfPages(await file.arrayBuffer());
        const texts = pages.flatMap((p) => p.paragraphs);
        if (texts.length === 0) {
          throw new Error(
            'No text layer found — this PDF is likely scanned images. OCR is not supported yet.',
          );
        }
        setPhase('translating');
        const translations = await translateAll(texts, translateSnippets, onProgress);
        let cursor = 0;
        const sections: BilingualSection[] = pages
          .filter((p) => p.paragraphs.length > 0)
          .map((page) => ({
            heading: `Page ${page.pageNumber}`,
            pairs: page.paragraphs.map((original) => ({
              original,
              translation: translations[cursor++] ?? '',
            })),
          }));
        result = {
          filename: `${baseName(file.name)}.bilingual.html`,
          blob: new Blob([serializeBilingualHtml(baseName(file.name), sections)], {
            type: 'text/html',
          }),
        };
      } else if (ext === 'epub') {
        const { extractEpub } = await import('@/lib/documents/epub');
        const book = extractEpub(await file.arrayBuffer());
        const texts = book.chapters.flatMap((c) => c.paragraphs);
        if (texts.length === 0) throw new Error('No readable chapters found in this EPUB.');
        setPhase('translating');
        const translations = await translateAll(texts, translateSnippets, onProgress);
        let cursor = 0;
        const sections: BilingualSection[] = book.chapters.map((chapter) => ({
          heading: chapter.title,
          pairs: chapter.paragraphs.map((original) => ({
            original,
            translation: translations[cursor++] ?? '',
          })),
        }));
        result = {
          filename: `${baseName(file.name)}.bilingual.html`,
          blob: new Blob([serializeBilingualHtml(book.title, sections)], { type: 'text/html' }),
        };
      } else {
        throw new Error(`Unsupported file type ".${ext}" — use PDF, EPUB, TXT, MD, SRT, or ASS.`);
      }
      setOutput(result);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const download = () => {
    if (!output) return;
    const url = URL.createObjectURL(output.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = output.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const busy = phase === 'extracting' || phase === 'translating';

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Translate a document</h1>
      <p className="mt-1 text-sm text-slate-500">
        PDF, EPUB, TXT, Markdown, SRT, and ASS. Output is bilingual
        {settings && (
          <>
            {' '}
            into <span className="font-medium">{languageLabel(settings.targetLang)}</span>
          </>
        )}
        . Files never leave your machine except the text sent to your configured model.
      </p>

      <div
        className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-10 text-center hover:border-blue-400"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && !busy) void handleFile(file);
        }}
      >
        <p className="text-sm font-medium text-slate-700">
          {busy ? fileName : 'Drop a file here or click to choose'}
        </p>
        <p className="mt-1 text-xs text-slate-400">.pdf .epub .txt .md .srt .ass</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.epub,.txt,.md,.srt,.ass"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {phase === 'extracting' && (
        <p className="mt-4 text-sm text-slate-600">Extracting text from {fileName}…</p>
      )}

      {phase === 'translating' && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Translating {fileName} — batch {progress.done}/{progress.total}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{
                width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
      )}

      {phase === 'done' && output && (
        <div className="mt-4 flex items-center gap-3 rounded-md bg-emerald-50 px-4 py-3">
          <span className="text-sm text-emerald-800">Done — {output.filename}</span>
          <button
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={download}
          >
            Download
          </button>
        </div>
      )}

      {phase === 'error' && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Scanned PDFs (no text layer) are not supported yet — OCR is on the roadmap. Model and
        target language are configured in the{' '}
        <button className="underline" onClick={() => browser.runtime.openOptionsPage()}>
          extension options
        </button>
        .
      </p>
    </div>
  );
}
