# Test cases: Document Converter and Audio Transcript

Owner items #26 and #27 (backlog 2026-10-19, Notion card "Tools", MIG-396). Every case below is automated, and each
automated test names the cases it runs (`TC-…` in its title):

- **End to end** (Playwright, headless, against the live stack): `e2e/tools-converter.spec.ts`, `e2e/tools-transcript.spec.ts`.
  Run: `E2E_MINT=1 npx playwright test e2e/tools-converter.spec.ts e2e/tools-transcript.spec.ts` (Riverside Health's
  administrator; `E2E_CONVERTER_MATRIX=0` skips the matrix; `E2E_LOCAL_BUILD=http://127.0.0.1:4301` checks a worktree's
  `ng build` before the console container is rebuilt, see `e2e/support/local-build.ts`).
- **Unit** (`ng test`): `src/app/shared/ui/object-picker.spec.ts`, `src/app/features/tools/**/*.spec.ts`.
- **Services**: media-service `SourceFormatsTest`, `TranscriberBusyAndLimitsTest`, `ConverterBigTablesTest` (the queue and
  the 429); storage-service `StorageFindObjectsTest` and the cross-tenant probe (the picker's search).

All inputs are synthetic and invented for testing (`e2e/fixtures/tools/`): a discharge note, lab results, a care plan, a
discharge summary, a vitals chart, a ward-round deck, and a 13-second ward-round note read by the macOS voice (.m4a and
.mp3). No real patient data.

## Document Converter

| Id | Case | Input | Expected | Limit / edge |
|---|---|---|---|---|
| TC-C01 | Text documents: every input to every output | discharge-note.txt, and it converted to doc, docx, dotx, odt, ott, fodt, rtf, xhtml; care-plan.md | each of doc, docx, dotx, md, odt, ott, fodt, html, xhtml, rtf, txt, jpg, pdf, png comes back, with the bytes of its kind (`%PDF`, a zip, an OLE file, a PNG …) | — |
| TC-C02 | Spreadsheets: every input to every output | lab-results.csv, and it converted to fods, ods, ots, tsv, xls, xlsx, xltx | csv, fods, html, jpg, ods, ots, pdf, png, tsv, xhtml, xls, xlsx, xltx | a CSV or TSV to PDF is drawn without LibreOffice |
| TC-C03 | Presentations: every input to every output | ward-round.fodp, and it converted to odp, otp, ppt, pptx, potx | bmp, fodp, gif, html, jpg, odp, otp, pdf, png, ppt, pptx, potx, svg, tif, xhtml | — |
| TC-C04 | Drawings and images: every input to every output | vitals-chart.svg, and it converted to bmp, fodg, gif, jpg, jpeg, odg, otg, pdf, png, tif, tiff | bmp, fodg, gif, jpg, jpeg, odg, otg, pdf, png, svg, tif, tiff | — |
| TC-C05 | HTML: every input to every output | discharge-summary.html (and .htm) | doc, docx, dotx, odt, ott, fodt, html, xhtml, rtf, txt, jpg, pdf, png (read as a Writer document) | — |
| TC-C06 | A file over its limit | 51 MB of text to PDF (server); a 2 MB file with the stated limit at 1 MB (screen) | server: "over the 50 MB limit for this conversion"; screen: "takes up to 1 MB", Convert disabled, nothing sent | 50 MB a file; CSV/TSV to PDF 500 MB; XLSX to PDF 100 MB |
| TC-C07 | The queue is full (429) | any conversion answered 429 | "busy … Try again in 30 seconds" in the warning colour, a clock, Try again; Try again converts | Retry-After 30 |
| TC-C08 | A burst past the slots and the queue | (slots + waiting) × 2 conversions at once (12) | at least the slots convert; every other answer is 429 with Retry-After 30 and "busy"; nothing fails | 2 slots, 4 waiting |
| TC-C09 | Upload, convert, download | discharge-note.txt to docx | "Detected as Text Document", Ready to download, the download is discharge-note.docx | — |
| TC-C10 | From a bucket: the picker | <bucket>/e2e/tools/discharge-summary.html | the only bucket opens by itself; Enter searches all of it; the match names its folder, type, size and modified date | search: 5,000 objects looked at, 200 shown |
| TC-C11 | The picker's type filter | an .mp3 in the same folder | hidden under "Supported types"; greyed and not selectable under "All files" | — |
| TC-C12 | The picker keeps the selection | select, re-sort, Use this file, reopen | the footer says "Selected: …"; the row stays marked through the sort; reopened, the folder opens with the file marked | — |
| TC-C13 | Saved, listed, detail on the right, deleted | convert to docx, save to <bucket>/e2e/tools/converted | listed in Recent conversions (search finds it; the date range keeps it); a row opens its detail sliding over the right; Delete takes it off the list, the files stay | Recent conversions: 7/30/90 days or all time, remembered per person |

Not testable here: .wpd, .sxw, .sxc, .sxi, .vsd and .vsdx **inputs** (LibreOffice reads them, nothing here can write
one). Removed on 2026-10-19 because LibreOffice 26.2 cannot write them (the matrix found each one failing or, for Visio,
writing a PDF under a Visio name): the .sxw/.sxc/.sxi, .swf and .vsd/.vsdx outputs, and SVG from text, a spreadsheet or
HTML.

## Audio Transcript

| Id | Case | Input | Expected | Limit / edge |
|---|---|---|---|---|
| TC-T01 | What the server takes, and what it refuses | GET audioTranscript.json/limits; a .wav upload; a missing bucket key | mp3, m4a; upload 250 MB, bucket 500 MB, 30 minutes; .wav "expected .mp3 or .m4a"; the missing key not a success | — |
| TC-T02 | Upload and transcribe | ward-round-note.m4a | the "What it takes" panel states the limits; a transcript with "N segments", holding the dictated words (blood pressure, patient, ward) | — |
| TC-T03 | From a bucket: the picker searches | "ward-round-note" + Enter | the match in e2e/tools/audio/, its size (KB) and modified date | — |
| TC-T04 | The picker filters by type | the folder also holds lab-results.csv | hidden under "mp3, m4a" and "mp3"; greyed under "All files" | — |
| TC-T05 | The picker keeps the selection | select, sort by Modified, Use this file, reopen | the footer says "Selected: ward-round-note.mp3"; the card shows the name, folder, size and date; reopened, the file is marked | — |
| TC-T06 | Bucket file with timestamps | ward-round-note.mp3, timestamps on | segments with [HH:MM:SS] marks; the Table view has a Time column | — |
| TC-T07 | The wrong kind, and a file over the limit, said before sending | a .wav; a 2 MB .mp3 with the stated limit at 1 MB | "not an .mp3 or .m4a file"; "this way takes up to 1 MB"; Extract transcript disabled | upload 250 MB, bucket 500 MB |
| TC-T08 | The transcriber is busy (429) | the upload answered 429 | the error says busy, in the warning colour with a clock (data-busy), and offers Try again | Retry-After 30 (the transcriber's own when it sends one) |

## Run once, 2026-10-19

Against the local build of `tools-api-ui` (E2E_LOCAL_BUILD) and the live services (media-service 1ef3137, storage-service
8172de6): every case passed; the matrix converted **504 of 504** pairs in 17 seconds; the burst: 12 at once, 6 converted,
6 told busy. Earlier the same day, before the fixes, the matrix found 97 of 622 pairs failing (HTML read as Writer/Web,
and outputs LibreOffice no longer writes) and the content check found 28 Visio outputs that were PDFs.
