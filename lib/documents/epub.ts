/** EPUB chapter extraction: unzip, follow container → OPF → spine, pull block text. */
import { unzipSync, strFromU8 } from 'fflate';

export interface EpubChapter {
  title: string;
  paragraphs: string[];
}

export interface EpubContent {
  title: string;
  chapters: EpubChapter[];
}

function parseXml(source: string, mime: DOMParserSupportedType): Document {
  return new DOMParser().parseFromString(source, mime);
}

function resolvePath(baseFile: string, relative: string): string {
  const stack = baseFile.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (part === '..') stack.pop();
    else if (part !== '.' && part !== '') stack.push(part);
  }
  return stack.join('/');
}

const BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'];

function extractParagraphs(html: string): string[] {
  const doc = parseXml(html, 'text/html');
  const blocks = Array.from(doc.querySelectorAll(BLOCK_TAGS.join(',')));
  return blocks
    .filter((el) => !el.querySelector(BLOCK_TAGS.join(','))) // leaf blocks only
    .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => text.length > 1);
}

export function extractEpub(data: ArrayBuffer): EpubContent {
  const files = unzipSync(new Uint8Array(data));
  const read = (path: string): string | null => {
    const file = files[path];
    return file ? strFromU8(file) : null;
  };

  const container = read('META-INF/container.xml');
  if (!container) throw new Error('Not a valid EPUB: missing META-INF/container.xml');
  const containerDoc = parseXml(container, 'text/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not a valid EPUB: no rootfile in container.xml');

  const opf = read(opfPath);
  if (!opf) throw new Error(`Not a valid EPUB: missing ${opfPath}`);
  const opfDoc = parseXml(opf, 'text/xml');

  const title =
    opfDoc.getElementsByTagName('dc:title')[0]?.textContent?.trim() ||
    opfDoc.querySelector('title')?.textContent?.trim() ||
    'Untitled';

  const hrefById = new Map<string, string>();
  for (const item of Array.from(opfDoc.querySelectorAll('manifest > item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) hrefById.set(id, href);
  }

  const chapters: EpubChapter[] = [];
  for (const itemref of Array.from(opfDoc.querySelectorAll('spine > itemref'))) {
    const idref = itemref.getAttribute('idref');
    const href = idref ? hrefById.get(idref) : undefined;
    if (!href) continue;
    const chapterSource = read(resolvePath(opfPath, href));
    if (!chapterSource) continue;
    const chapterDoc = parseXml(chapterSource, 'text/html');
    const chapterTitle =
      chapterDoc.querySelector('h1, h2, title')?.textContent?.trim() || href;
    const paragraphs = extractParagraphs(chapterSource);
    if (paragraphs.length > 0) chapters.push({ title: chapterTitle, paragraphs });
  }

  return { title, chapters };
}
