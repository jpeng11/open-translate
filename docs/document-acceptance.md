# Document acceptance

Open Translate has its own interface and an explicit document behavior contract. This acceptance work does not assert equality with the commercial extension or evaluate translation quality. All fixtures are independently authored, synthetic content. The endpoint tests use deterministic translations; the scanned PDF test uses the real bundled English OCR model and worker.

The final machine-readable record is [acceptance/documents.json](acceptance/documents.json). It binds results to the implementation digest and the current Chrome build evidence. The browser test records and screenshots remain in `dist/acceptance/`; fixture and export hashes identify the files inspected.

| Coverage | Evidence | Boundary |
| --- | --- | --- |
| CJK, RTL, Devanagari and Thai | Import a seven-segment PDF, export prescribed Unicode translations, independently parse through PDF.js, read the attached HTML, render the export, and assert painted pixels for every character in 日本語の翻訳 | Glyph rendering and text retention, not linguistic accuracy; regional CJK glyph variants use the bundled SC face |
| Columns and transformed pages | Interleaved content streams become left-column then right-column reading order; a cropped page rotated 90° retains bounds and rotated searchable translation | Clear two-column gutter and ordinary rotated text; ambiguous/skewed layouts require review |
| Scanned PDF | Create an image-only English PDF, perform real OCR, export the recognized translation, and independently extract searchable text | Crisp printed English on white paper; handwriting, low-resolution scans and complex backgrounds are not qualified |
| Long text | Import a narrow source region, export a long paragraph onto continuation pages, independently verify all 60 occurrences and exact attached HTML | Continuation preserves content, not original pagination |
| Navigation/forms | PDF.js resolves native bookmarks, named/internal/external links, page labels and text/checkbox/dropdown values in bilingual and translated-only exports; PDF-lib edits/reloads a retained field | Basic AcroForms; XFA and JavaScript calculations are unsupported; unusual widget appearances need review |
| Signed document semantics | Remove signature fields/validity flags and extract a visible invalidation notice | Altered files do not preserve signature validity |
| DOCX | Independently unzip exported OOXML and verify styled runs, links, table text, headers/footers, footnote/endnote IDs, referenced media and bilingual notes | Minimal OOXML corpus; no Word/LibreOffice rendering or tracked-change acceptance |
| HTML/EPUB | DOM/XML and independent ZIP parsing verify safe inline styles, links/code, OPF spine order, nested relative resources, duplicate-ID removal and decoding of a retained PNG | Active/remote content is deliberately sanitized; full EPUBCheck and reader pagination are separate |
| Invalid/large/encrypted input | Malformed PDF/XML, 201 pages, >32 MP page, >30 MiB input, >100 MiB advertised archive expansion, valid Standard R2 PDFs with secret or empty password | Encrypted input requires a locally unlocked copy; archive case tests the declared-size guard before allocation |

`tests/browser/document-corpus.spec.mjs` and `document-parity.spec.mjs` execute browser bundles of the same source document modules, with real packaged worker/OCR/font assets. They do not execute the extension app interface. The broader `extension.spec.mjs` acceptance loads the built unpacked Chrome extension and exercises document upload, translation, lazy PDF preview, and downloaded bilingual PDF export. The final evidence separates these two harnesses. Existing Node tests additionally verify marker integrity, grapheme wrapping, bidi runs, column order, native PDF graph retention, transformed annotation bounds and background repair.

Visual inspection of the exported multilingual PDF confirmed visible Chinese, Japanese, Korean, Arabic, Hebrew, Devanagari and Thai text; of the rotated PDF confirmed the translated baseline follows the original; of the scanned PDF confirmed readable translation and a clean page layout. The earlier CFF subset silently lost Japanese 翻訳 outlines. The bundled TrueType replacement with padded glyph records fixes that defect and has an explicit pixel regression assertion. Its source asset is about 21 MiB; the representative seven-script output is about 32 KiB. The combined extension ZIP is about 29 MiB.

PDF.js text extraction reorders RTL words with trailing digits and some Indic combining marks even though the PDF includes logical `ActualText` and `ToUnicode` mappings. Exact logical text is retained in the attached and separately downloadable semantic HTML. Search/copy behavior in other PDF viewers has not been qualified. Translated page backgrounds are rasterized; original bilingual pages retain their native vector objects. Local harmonic glyph repair can leave faint remnants and cannot reconstruct detailed textures reliably. No PDF/UA, OCR-quality, full Office-layout, EPUB-reader, mobile/Safari, or full commercial parity claim is made.

Reproduce the focused checks with:

```sh
node --test tests/extension/document-layout.test.mjs tests/extension/pdf-navigation.test.mjs tests/extension/pdf-background.test.mjs
npx playwright test tests/browser/document-corpus.spec.mjs tests/browser/document-parity.spec.mjs --output=/tmp/open-translate-documents
```

Run `npm run acceptance` for the frozen implementation/build and full extension browser workflow; `npm run acceptance:verify` checks the recorded evidence bindings. Any implementation or test changes require a new acceptance run.
