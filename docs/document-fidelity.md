# Document and PDF fidelity

The importer owns document structure. Translation providers receive paragraph text with opaque boundaries around formatted text spans. Export validates the boundary order, writes translated text into cloned text nodes, and never interprets returned text as HTML or XML. Damaged markers stop export and retain the original document.

## DOCX

Text runs, run properties (bold, italics, colors, underlining and font choices), hyperlink relationship IDs, paragraph properties, tables, and other ZIP resources survive translation. The main document, headers, footers, footnotes, endnotes and comments are translated. Bilingual output inserts a translated paragraph with the same formatting; translated-only output replaces its text while retaining its structure. Paragraph IDs/bookmarks are removed from bilingual clones to avoid duplicates.

This preserves formatting boundaries rather than inferring which newly reordered translated word should inherit a source style. Drawing/text-box layout, tracked changes, fields, numbering, and page breaks still depend on the word processor's layout engine. A longer translated header or table cell may reflow. Complex files need visual review in Word or LibreOffice.

## HTML and EPUB

Safe inline formatting, document classes, links, code and preformatted blocks are retained. Layout styles use a bounded CSS property allowlist. Script, active embeds, forms, event handlers, network-bearing CSS, and external tracking images are removed. EPUB chapter ordering follows OPF spine ordering, with a ZIP order fallback for malformed/missing package metadata; packaged stylesheet and image resources remain available. EPUB's `mimetype` ZIP member remains first and uncompressed.

Remote fonts/styles/images and unsupported CSS are deliberately not fetched. Sanitizing an export can therefore change the appearance of files that rely on active or remote content. Translated-only output retains existing anchors; bilingual copies omit duplicate element IDs.

## PDF

Bilingual export copies original PDF pages with their original vector drawing and searchable source text. Each translated page uses a rendered source background, removes text-region pixels, and adds real PDF text with locally bundled, subset-embedded Noto fonts. Chinese, Japanese, Korean, Latin, Greek, Cyrillic, Arabic, Persian, Hebrew, Devanagari and Thai scripts have local font coverage. Complex-script glyph shaping/positioning uses Fontkit, with Unicode bidirectional run resolution and mirrored punctuation from bidi-js. Each translated line includes logical Unicode `ActualText` and an embedded `ToUnicode` map; translated text is searchable and selectable rather than painted into a screenshot.

Text wraps at grapheme boundaries and can use available space below its original region. Font size decreases to 6 points when needed. Text that still does not fit is retained on numbered continuation pages; it is never silently clipped. Clear two-column gutters determine column reading order, including right-to-left columns. Ambiguous layouts retain content-stream order.

A reflowable, semantic HTML companion includes logical source/target text in reading order. It is attached inside the PDF as `translation-accessible.html` and available through **Download accessible HTML**. It provides a readable alternative for small/complex page layouts and characters outside the bundled fonts. Unsupported glyphs cause an explicit export error instead of silently producing missing-glyph boxes.

Remaining constraints: translated page backgrounds are raster images; the original copied pages stay vector. Document-level outlines/bookmarks, forms, original structure tags and signatures are not reconstructed, and the generated PDF is not a PDF/UA conformance claim. White text-region replacement can affect backgrounds that overlap diagrams. Overlapping/rotated text, complex tables, marginalia and uncertain reading order still need review. Source files remain unchanged. Limits are 30 MiB, 200 pages and 32 megapixels per rendered page.

## Reproducible verification

- `node --test tests/extension/document-layout.test.mjs`: boundary integrity, grapheme wrapping, overflow, RTL, embedded Unicode/font subsets and column ordering.
- `npx playwright test tests/browser/document-parity.spec.mjs`: actual browser DOM/XML import/export; DOCX relationships/styles/header/footer; HTML sanitization; EPUB spine/styles/images; PDF.js extraction of original and Chinese/Arabic/Hebrew translated text and complete continuation text.

Implementation references: [pdf-lib page copying and font embedding](https://pdf-lib.js.org/docs/api/classes/pdfdocument), [Fontkit text layout](https://github.com/foliojs/fontkit#glyph-metrics-and-layout), [bidi-js](https://github.com/lojjic/bidi-js), [Noto CJK](https://github.com/notofonts/noto-cjk), and [Noto other scripts](https://github.com/notofonts/noto-fonts). Bundled font provenance, hashes and SIL Open Font License texts are in `extension/assets/fonts/`.
