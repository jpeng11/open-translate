/** Plain-text paragraph splitting + bilingual serialization. */

export function splitParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function serializeBilingualTxt(paragraphs: string[], translations: string[]): string {
  return paragraphs
    .map((p, i) => {
      const t = translations[i]?.trim();
      return t ? `${p}\n${t}` : p;
    })
    .join('\n\n')
    .concat('\n');
}

export interface BilingualSection {
  heading?: string;
  pairs: { original: string; translation: string }[];
}

/** Standalone bilingual HTML document used by TXT/PDF/EPUB exports. */
export function serializeBilingualHtml(title: string, sections: BilingualSection[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = sections
    .map((section) => {
      const heading = section.heading ? `<h2>${esc(section.heading)}</h2>\n` : '';
      const pairs = section.pairs
        .map(
          (pair) =>
            `<div class="pair"><p class="src">${esc(pair.original)}</p>` +
            `<p class="dst">${esc(pair.translation)}</p></div>`,
        )
        .join('\n');
      return `<section>\n${heading}${pairs}\n</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem;
         font: 16px/1.6 system-ui, sans-serif; color: #1e293b; }
  h2 { margin-top: 2.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: .3rem; }
  .pair { margin: 1rem 0; }
  .pair p { margin: 0; }
  .src { color: #64748b; }
  .dst { margin-top: .15rem; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${body}
</body>
</html>
`;
}
