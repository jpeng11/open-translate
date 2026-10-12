# Document and PDF fidelity

The importer owns document structure. Translation providers receive paragraph text with opaque boundaries around formatted text spans. Export validates the boundary order, writes translated text into cloned text nodes, and never interprets returned text as HTML or XML. Damaged markers stop export and retain the original document.

## DOCX

Text runs, run properties (bold, italics, colors, underlining and font choices), hyperlink relationship IDs, paragraph properties, tables, and other ZIP resources survive translation. The main document, headers, footers, footnotes, endnotes and comments are translated. Bilingual output inserts a translated paragraph with the same formatting; translated-only output replaces its text while retaining its structure. Paragraph IDs/bookmarks are removed from bilingual clones to avoid duplicates.

This preserves formatting boundaries rather than inferring which newly reordered translated word should inherit a source style. Drawing/text-box layout, tracked changes, fields, numbering, and page breaks still depend on the word processor's layout engine. A longer translated header or table cell may reflow. Complex files need visual review in Word or LibreOffice.

## HTML and EPUB

Safe inline formatting, document classes, links, code and preformatted blocks are retained. Layout styles use a bounded CSS property allowlist. Script, active embeds, forms, event handlers, network-bearing CSS, and external tracking images are removed. EPUB chapter ordering follows OPF spine ordering, with a ZIP order fallback for malformed/missing package metadata; packaged stylesheet and image resources remain available. EPUB's `mimetype` ZIP member remains first and uncompressed.

Remote fonts/styles/images and unsupported CSS are deliberately not fetched. Sanitizing an export can therefore change the appearance of files that rely on active or remote content. Translated-only output retains existing anchors; bilingual copies omit duplicate element IDs.

## PDF

Bilingual export retains native original PDF page objects with their original vector drawing and searchable source text, then inserts translated pages. Translated-only export replaces the original page paint contents while retaining page identity. This keeps native outlines/bookmarks, named destinations, page labels and standard AcroForm field trees connected to actual exported pages. Internal links map to translated counterparts on translated pages; HTTP(S)/mailto links remain clickable. Named destinations retain their native bookmark targets. Text fields, checkboxes and dropdowns retain editable values; bilingual views share the same field values across original and translated widgets. Each translated page uses a rendered source background, repairs glyph pixels locally, and adds real PDF text with locally bundled, subset-embedded Noto fonts. Chinese, Japanese, Korean, Latin, Greek, Cyrillic, Arabic, Persian, Hebrew, Devanagari and Thai scripts have local font coverage. Complex-script glyph shaping/positioning uses Fontkit, with Unicode bidirectional run resolution and mirrored punctuation from bidi-js. Each translated line includes logical Unicode `ActualText` and an embedded `ToUnicode` map; translated text is searchable and selectable rather than painted into a screenshot.

Text wraps at grapheme boundaries and can use available space below its original region. Font size decreases to 6 points when needed. Text that still does not fit is retained on numbered continuation pages; it is never silently clipped. Clear two-column gutters determine column reading order, including right-to-left columns. Ambiguous layouts retain content-stream order.

A reflowable, semantic HTML companion includes logical source/target text in reading order. It is attached inside the PDF as `translation-accessible.html` and available through **Download accessible HTML**. It provides a readable alternative for small/complex page layouts and characters outside the bundled fonts. Unsupported glyphs cause an explicit export error instead of silently producing missing-glyph boxes.

Background repair retains colored paper and connected diagram strokes crossing text-region boundaries. Pixel inspection prevents a longer translation from expanding into detected artwork; that text moves to continuation pages. This is bounded harmonic reconstruction, not learned image inpainting: dense textures or glyphs touching diagram strokes still need review.

Signature fields and cryptographic validity flags are removed from altered exports. Their visual appearance may remain as a stamp, with a visible “Source digital signature invalidated by translation.” notice on affected original/translated pages. Exported files must be signed again if signatures are needed. Form JavaScript calculations, submission/launching actions and XFA behavior are not retained; ordinary field values and widgets remain available.

Remaining constraints: translated page backgrounds are raster images; original pages stay vector. Original structure tags are not a complete accessibility description of new translated content, and the generated PDF is not a PDF/UA conformance claim. Rotated form appearances and unusual destination variants need visual review. Overlapping/rotated text, complex tables, marginalia and uncertain reading order still need review. Source files remain unchanged. Limits are 30 MiB, 200 pages and 32 megapixels per rendered page.

## Reproducible verification

- `node --test tests/extension/document-layout.test.mjs`: boundary integrity, grapheme wrapping, overflow, RTL, embedded Unicode/font subsets and column ordering.
- `node --test tests/extension/pdf-navigation.test.mjs tests/extension/pdf-background.test.mjs`: native graph retention, combined field/widget handling, coordinate transforms, signature invalidation and colored/diagram background repair.
- `npx playwright test tests/browser/document-parity.spec.mjs`: actual browser DOM/XML import/export; DOCX relationships/styles/header/footer; HTML sanitization; EPUB spine/styles/images; PDF.js extraction of original and Chinese/Arabic/Hebrew translated text and complete continuation text; PDF.js outline/named destination/link resolution; page labels; editable form values in both output modes; visible signature invalidation notices.

Implementation references: [pdf-lib page copying and font embedding](https://pdf-lib.js.org/docs/api/classes/pdfdocument), [Fontkit text layout](https://github.com/foliojs/fontkit#glyph-metrics-and-layout), [bidi-js](https://github.com/lojjic/bidi-js), [Noto CJK](https://github.com/notofonts/noto-cjk), and [Noto other scripts](https://github.com/notofonts/noto-fonts). Bundled font provenance, hashes and SIL Open Font License texts are in `extension/assets/fonts/`.

## Original product reference boundary

The packaged original extension's PDF entry hosts `https://app.immersivetranslate.com/pdf`. The live official viewer was loaded with the same synthetic navigation/form fixture used in our tests. Its PDF.js runtime parsed two bookmarks, page labels, and the fixture's text/checkbox/dropdown values. These source observations corroborate the input/navigation contract now preserved by our independent exporter.

The source UI offered bilingual/translation-only and text-based/image-based export choices. The observed translation attempt reported zero translated pages and displayed a PDF Pro/scanned-document notice. A successfully translated original export was **not** captured, so these checks do not establish original-versus-replacement exported-file equivalence. The retained, bounded ledger is [pdf-reference-runtime.json](evidence/pdf-reference-runtime.json); raw screenshots and runtime capture remain local under `dist/rev/pdf-reference/`.
