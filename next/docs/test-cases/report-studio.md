# Test cases: Report Studio (phases 1-3, QA pass 2026-10-20)

Every case below was run on the live stack (Riverside Health, synthetic or public research data; every model answer a DRAFT for a clinician, never a diagnosis) and is automated -- it reruns after every change:

- **Live matrix** (`etl-platform/tests/report-studio/report_matrix.py`): TC-RS-001 … TC-RS-180 below, 180 PASS of 180 on the final run.
- **Known-good outputs** (media `MedicalReportsGoldenTest`, run by `etl-platform/tests/report-studio/golden.sh` with the broken-word scan and the HTML/PDF parity check): TC-RG-*.
- **End to end** (console Playwright, `npm run e2e:reports`): TC-RE-*.
- **Unit**: media `TableWidthsTest`, `BundleSourceTest`, `FiltersAndCountsTest`, `DamagedPicturesTest` and the existing Report Studio suites; console `features/report-studio/**/*.spec.ts` (designer editors, source picker, filter rules).

## How to run them

```
# console end to end (headless; mints test tokens; about 30 s)
cd scheduler1/next && npm run e2e:reports

# renderer: known-good HTML/PDF, no broken words, HTML laid out like the PDF (needs the media image fonts once: media docs/report-studio-tests.md)
etl-platform/tests/report-studio/golden.sh ../media-service

# the live matrix (Riverside; templates reused by name, reports by idempotency key; ~15 min)
cd etl-platform && python3 tests/report-studio/report_matrix.py        # --only 1,2,3,4,5
#   results: .state/report-studio/results-<time>.jsonl and matrix-<time>.md; exit 1 on any FAIL

# rewrite the known-good files after an intended renderer change (look at -Dstudio.dump=<dir> first)
cd media-service && mvn -o test -Dtest=MedicalReportsGoldenTest -Dgolden.update=true
```

Run the media test and every build under `~/.etl-build.lock` (golden.sh takes it itself). The console specs run against the deployed console (:4400); rebuild it first or you test yesterday's bundle.

## Templates under test

| Template | Data (live) | Pictures |
|---|---|---|
| X-ray triage report | XRAY_TRIAGE_OUTCOMES latest run: summary, latest, by_class, confusion, reviewed (5 files, BUNDLE) | chest X-ray thumbnails + "review first" grid (CoronaHack, CC BY 4.0) |
| Ultrasound findings report | BREAST_US_OUTCOMES latest run, same 5 files | images + expert outlines, grid (BUSI, CC0) |
| Brain tumour MRI grading | brain MRI pipeline: results, confusion, accuracy | MRI slices + mismatch grid (CC BY 4.0) |
| Diabetic retinopathy grading | retina DR pipeline: results, confusion, accuracy | fundus photographs + mismatch grid (CC0) |
| Hospital readmission risk | readmission statistics (one CSV, rows) | — (aggregate data) |
| Patient 360 follow-up list | Patient 360: cohort + flagged (FHIR sandbox, synthetic), DRAFT model notes | — |
| Drug safety monitor | drug-safety-monitor (run) + reactions.csv (bucket) | — |
| Partner lab results | partner lab run (rows); 50,000-row upload for the long-table case | — |
| Wound assessment report | synthetic wound clinic month (sample, bucket file, upload, pasted) | synthetic wound photographs, before/after grid, signature + stamp |

Each report: summary KPIs on top, the detail table, pictures where the data has them, a short insights section (DRAFT where it comes from a model, written so it stays true for any data: e.g. the ultrasound model said "suspicious for malignancy" for all 60 images, 33.3 % accuracy, and the report shows it in its KPIs, insight and confusion table), the data source and licence line, approve and sign.

## Live matrix (final run)

| Id | Area | Template | Case | Input | Expected | Actual (final run) | Result |
|---|---|---|---|---|---|---|---|
| TC-RS-001 | design | X-ray triage report | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-002 | lifecycle | X-ray triage report | publish | the imported draft (or the template made by an earlier run) | a published version | v2 PUBLISHED | PASS |
| TC-RS-003 | data source | X-ray triage report | pipeline run output | {"connector": "BUNDLE", "parts": {"summary": {"connector": "RUN_OUTPUT", "jobQueueId": 8522, "runDatasetId": 8795}, "latest": {"connector":  | PDF and HTML preview, no blocking error | 200, 11 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-004 | data source | X-ray triage report | bucket file | {"connector": "BUNDLE", "parts": {"summary": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "datasets/chest-xray/res | PDF and HTML preview, no blocking error | 200, 11 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-005 | data source | X-ray triage report | upload | {"connector": "UPLOAD", "sourceId": "01M5BZNBC07KA260BAYQ7XDPXR"} | PDF and HTML preview, no blocking error | 200, 11 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-006 | data source | X-ray triage report | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"summary\": [{\"images\": \"40\", \"correct\": \"18\", \"review_first\": \"8\", \"one\": \"1\", \"ru | PDF and HTML preview, no blocking error | 200, 11 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-007 | data source | X-ray triage report | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZNB9KEWPRP36X1A7278QW"} | PDF and HTML preview, no blocking error | 200, 11 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-008 | design | Ultrasound findings report | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-009 | lifecycle | Ultrasound findings report | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-010 | data source | Ultrasound findings report | pipeline run output | {"connector": "BUNDLE", "parts": {"summary": {"connector": "RUN_OUTPUT", "jobQueueId": 8523, "runDatasetId": 8817}, "latest": {"connector":  | PDF and HTML preview, no blocking error | 200, 14 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-011 | data source | Ultrasound findings report | bucket file | {"connector": "BUNDLE", "parts": {"summary": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "datasets/breast-ultraso | PDF and HTML preview, no blocking error | 200, 14 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-012 | data source | Ultrasound findings report | upload | {"connector": "UPLOAD", "sourceId": "01M5BZNMQK9YBF8F486N5FXTDH"} | PDF and HTML preview, no blocking error | 200, 13 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-013 | data source | Ultrasound findings report | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"summary\": [{\"images\": \"60\", \"correct\": \"20\", \"review_first\": \"60\", \"one\": \"1\", \"r | PDF and HTML preview, no blocking error | 200, 13 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-014 | data source | Ultrasound findings report | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZNMNZ8R9NPGCEN2C1W9QE"} | PDF and HTML preview, no blocking error | 200, 13 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-015 | design | Brain tumour MRI grading | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-016 | lifecycle | Brain tumour MRI grading | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-017 | data source | Brain tumour MRI grading | pipeline run output | {"connector": "BUNDLE", "parts": {"results": {"connector": "RUN_OUTPUT", "jobQueueId": 8352, "runDatasetId": 6312}, "confusion": {"connector | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-018 | data source | Brain tumour MRI grading | bucket file | {"connector": "BUNDLE", "parts": {"results": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "datasets/brain-mri/resu | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-019 | data source | Brain tumour MRI grading | upload | {"connector": "UPLOAD", "sourceId": "01M5BZNWRE60M9889DEFQXK6BH"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-020 | data source | Brain tumour MRI grading | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"results\": [{\"image_id\": \"brain-mri-001\", \"image_key\": \"datasets/brain-mri/images/brain-mri- | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-021 | data source | Brain tumour MRI grading | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZNWPPSF5S3CFSDV1YQ54A"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-022 | design | Diabetic retinopathy grading | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-023 | lifecycle | Diabetic retinopathy grading | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-024 | data source | Diabetic retinopathy grading | pipeline run output | {"connector": "BUNDLE", "parts": {"results": {"connector": "RUN_OUTPUT", "jobQueueId": 8067, "runDatasetId": 4138}, "confusion": {"connector | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-025 | data source | Diabetic retinopathy grading | bucket file | {"connector": "BUNDLE", "parts": {"results": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "datasets/retina-dr/resu | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-026 | data source | Diabetic retinopathy grading | upload | {"connector": "UPLOAD", "sourceId": "01M5BZP3N2PTM6VHQFZF2Y0YY3"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-027 | data source | Diabetic retinopathy grading | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"results\": [{\"image_id\": \"retina-dr-001\", \"image_key\": \"datasets/retina-dr/images/retina-dr- | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-028 | data source | Diabetic retinopathy grading | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZP3JKZSS6SWHE7MHRX5E1"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 1 warnings; problems ['PREVIEW_IMAGES_LIMITED']; HTML 200 | PASS |
| TC-RS-029 | design | Hospital readmission risk | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-030 | lifecycle | Hospital readmission risk | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-031 | data source | Hospital readmission risk | pipeline run output | {"connector": "RUN_OUTPUT", "jobQueueId": 8380, "runDatasetId": 6948} | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-032 | data source | Hospital readmission risk | bucket file | {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "datasets/readmission/results/statistics.csv", "format": "CSV"} | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-033 | data source | Hospital readmission risk | upload | {"connector": "UPLOAD", "sourceId": "01M5BZP3QZZ8XSA70TD5DVC2FJ"} | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-034 | data source | Hospital readmission risk | pasted JSON | {"connector": "INLINE_JSON", "text": "[{\"factor\": \"overall\", \"level\": \"all encounters\", \"encounters\": \"101766\", \"readmit30\": \ | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-035 | data source | Hospital readmission risk | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZP3QAAV612C477JA95CQY"} | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-036 | data source | Hospital readmission risk | pasted CSV | {"connector": "INLINE_JSON", "text": "factor,level,encounters,readmit30,stay_days,readmit30_pct,avg_stay_days\noverall,all encounters,101766 | PDF and HTML preview, no blocking error | 200, 2 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-037 | design | Patient 360 follow-up list | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-038 | lifecycle | Patient 360 follow-up list | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-039 | data source | Patient 360 follow-up list | pipeline run output | {"connector": "BUNDLE", "parts": {"cohort": {"connector": "RUN_OUTPUT", "jobQueueId": 8390, "runDatasetId": 7067}, "flagged": {"connector":  | PDF and HTML preview, no blocking error | 200, 6 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-040 | data source | Patient 360 follow-up list | bucket file | {"connector": "BUNDLE", "parts": {"cohort": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "patient360/results/cohor | PDF and HTML preview, no blocking error | 200, 6 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-041 | data source | Patient 360 follow-up list | upload | {"connector": "UPLOAD", "sourceId": "01M5BZP3V4XRF9SWV2ANFQ6Z4T"} | PDF and HTML preview, no blocking error | 200, 6 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-042 | data source | Patient 360 follow-up list | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"cohort\": [{\"patient_id\": \"004b7f3b-eaaa-4eda-81dc-3a82854a363d\", \"name\": \"Mayte Escobar\",  | PDF and HTML preview, no blocking error | 200, 6 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-043 | data source | Patient 360 follow-up list | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZP3T552QYK5QG1XCWXMWS"} | PDF and HTML preview, no blocking error | 200, 6 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-044 | design | Drug safety monitor | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-045 | lifecycle | Drug safety monitor | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-046 | data source | Drug safety monitor | pipeline run output | {"connector": "BUNDLE", "parts": {"monitor": {"connector": "RUN_OUTPUT", "jobQueueId": 8383, "runDatasetId": 7014}, "reactions": {"connector | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-047 | data source | Drug safety monitor | bucket file | {"connector": "BUNDLE", "parts": {"monitor": {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "drug-safety/results/mon | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-048 | data source | Drug safety monitor | upload | {"connector": "UPLOAD", "sourceId": "01M5BZP3Y8HKYBGF6VD2XWEZH1"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-049 | data source | Drug safety monitor | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"monitor\": [{\"ingredient\": \"metoprolol\", \"ingredient_rxcui\": \"6918\", \"patients\": \"10\",  | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-050 | data source | Drug safety monitor | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZP3XEJ5286PHKDXWVA2YN"} | PDF and HTML preview, no blocking error | 200, 8 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-051 | design | Partner lab results | schema and checks | the template JSON (pipelines.py) | valid, no errors | {'errors': 0, 'warnings': 0, 'valid': True} | PASS |
| TC-RS-052 | lifecycle | Partner lab results | publish | the imported draft (or the template made by an earlier run) | a published version | v1 PUBLISHED | PASS |
| TC-RS-053 | data source | Partner lab results | pipeline run output | {"connector": "RUN_OUTPUT", "jobQueueId": 8062, "runDatasetId": 4010} | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-054 | data source | Partner lab results | bucket file | {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "labs/results/run-8062.csv", "format": "CSV"} | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-055 | data source | Partner lab results | upload | {"connector": "UPLOAD", "sourceId": "01M5BZP40FCWST291A4GHNJ3NP"} | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-056 | data source | Partner lab results | pasted JSON | {"connector": "INLINE_JSON", "text": "[{\"result_id\": \"LAB-79d32fc1\", \"patient_ref\": \"Patient/ba18818d-faef-44cd-9744-b12d8973d402\",  | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-057 | data source | Partner lab results | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BZP3ZYS9CBR2EX5YRT72N4"} | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-058 | data source | Partner lab results | pasted CSV | {"connector": "INLINE_JSON", "text": "result_id,patient_ref,loinc,test_name,value,unit,reference_low,reference_high,abnormal,is_abnormal,eff | PDF and HTML preview, no blocking error | 200, 1 pages, 0 errors, 0 warnings; HTML 200 | PASS |
| TC-RS-059 | generate | X-ray triage report | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 11 pages | PASS |
| TC-RS-060 | generate | X-ray triage report | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-061 | generate | X-ray triage report | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 466,551 bytes, @font-face 2, sheets 2 | PASS |
| TC-RS-062 | sign | X-ray triage report | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-063 | verify | X-ray triage report | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-064 | verify | X-ray triage report | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-065 | verify | X-ray triage report | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-066 | verify | X-ray triage report | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-067 | verify | X-ray triage report | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-068 | lifecycle | X-ray triage report | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-069 | generate | Ultrasound findings report | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 17 pages | PASS |
| TC-RS-070 | generate | Ultrasound findings report | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-071 | generate | Ultrasound findings report | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 1,453,759 bytes, @font-face 2, sheets 2 | PASS |
| TC-RS-072 | sign | Ultrasound findings report | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-073 | verify | Ultrasound findings report | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-074 | verify | Ultrasound findings report | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-075 | verify | Ultrasound findings report | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-076 | verify | Ultrasound findings report | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-077 | verify | Ultrasound findings report | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-078 | lifecycle | Ultrasound findings report | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-079 | generate | Brain tumour MRI grading | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 8 pages | PASS |
| TC-RS-080 | generate | Brain tumour MRI grading | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-081 | generate | Brain tumour MRI grading | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 658,180 bytes, @font-face 2, sheets 2 | PASS |
| TC-RS-082 | sign | Brain tumour MRI grading | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-083 | verify | Brain tumour MRI grading | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-084 | verify | Brain tumour MRI grading | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-085 | verify | Brain tumour MRI grading | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-086 | verify | Brain tumour MRI grading | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-087 | verify | Brain tumour MRI grading | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-088 | lifecycle | Brain tumour MRI grading | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-089 | generate | Diabetic retinopathy grading | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 8 pages | PASS |
| TC-RS-090 | generate | Diabetic retinopathy grading | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-091 | generate | Diabetic retinopathy grading | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 867,072 bytes, @font-face 2, sheets 2 | PASS |
| TC-RS-092 | sign | Diabetic retinopathy grading | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-093 | verify | Diabetic retinopathy grading | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-094 | verify | Diabetic retinopathy grading | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-095 | verify | Diabetic retinopathy grading | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-096 | verify | Diabetic retinopathy grading | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-097 | verify | Diabetic retinopathy grading | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-098 | lifecycle | Diabetic retinopathy grading | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-099 | generate | Hospital readmission risk | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 2 pages | PASS |
| TC-RS-100 | generate | Hospital readmission risk | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-101 | generate | Hospital readmission risk | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 134,995 bytes, @font-face 2, sheets 1 | PASS |
| TC-RS-102 | sign | Hospital readmission risk | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-103 | verify | Hospital readmission risk | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-104 | verify | Hospital readmission risk | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-105 | verify | Hospital readmission risk | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-106 | verify | Hospital readmission risk | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-107 | verify | Hospital readmission risk | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-108 | lifecycle | Hospital readmission risk | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-109 | generate | Patient 360 follow-up list | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 6 pages | PASS |
| TC-RS-110 | generate | Patient 360 follow-up list | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-111 | generate | Patient 360 follow-up list | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 145,239 bytes, @font-face 2, sheets 1 | PASS |
| TC-RS-112 | sign | Patient 360 follow-up list | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-113 | verify | Patient 360 follow-up list | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-114 | verify | Patient 360 follow-up list | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-115 | verify | Patient 360 follow-up list | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-116 | verify | Patient 360 follow-up list | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-117 | verify | Patient 360 follow-up list | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-118 | lifecycle | Patient 360 follow-up list | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-119 | generate | Drug safety monitor | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 8 pages | PASS |
| TC-RS-120 | generate | Drug safety monitor | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-121 | generate | Drug safety monitor | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 144,513 bytes, @font-face 2, sheets 1 | PASS |
| TC-RS-122 | sign | Drug safety monitor | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-123 | verify | Drug safety monitor | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-124 | verify | Drug safety monitor | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-125 | verify | Drug safety monitor | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-126 | verify | Drug safety monitor | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-127 | verify | Drug safety monitor | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-128 | lifecycle | Drug safety monitor | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-129 | generate | Partner lab results | generate v1 from the latest run | RUN_OUTPUT of the pipeline's latest run | SUCCEEDED, PDF + HTML | SUCCEEDED 1 pages | PASS |
| TC-RS-130 | generate | Partner lab results | outputs of v1 | report page | PDF and HTML outputs | ['HTML', 'PDF'] | PASS |
| TC-RS-131 | generate | Partner lab results | HTML output: fonts, sheets | v1 HTML download | Noto fonts embedded, CSP font-src data:, A4 sheet | 200, 129,386 bytes, @font-face 2, sheets 1 | PASS |
| TC-RS-132 | sign | Partner lab results | the generator approves own version | admin 4640 (generated v1) | refused | 409 APPROVAL_CONFLICT | PASS |
| TC-RS-133 | verify | Partner lab results | verify by version | v1 | verified | verified=True [] | PASS |
| TC-RS-134 | verify | Partner lab results | verify by file | the signed PDF | verified, matches v1 | verified=True | PASS |
| TC-RS-135 | verify | Partner lab results | one changed byte | the signed PDF, one byte in the signed range +1 | not verified | verified=False | PASS |
| TC-RS-136 | verify | Partner lab results | openssl cms -verify | signature and signed bytes from the PDF | Verification successful | CMS Verification successful | PASS |
| TC-RS-137 | verify | Partner lab results | openssl after one changed byte | the changed PDF | verification failure | 80DE68F801000000:error:1700006D:CMS routines:CMS_verify:content verify error:cry | PASS |
| TC-RS-138 | lifecycle | Partner lab results | generate again | same report, latest run | v2 made, v1 kept and still signed | SUCCEEDED versions=[1, 2, 3] v1 signed=True | PASS |
| TC-RS-139 | edge | X-ray triage report | required file missing (no summary) | the run's files without summary.csv | blocked: REQUIRED_FIELD_MISSING, nothing guessed | preview errors ['BINDING_NOT_RESOLVED', 'REQUIRED_FIELD_MISSING'] | PASS |
| TC-RS-140 | edge | X-ray triage report | generate with a required file missing | same | refused or the job fails REQUIRED_FIELD_MISSING; no version | job FAILED REQUIRED_FIELD_MISSING | PASS |
| TC-RS-141 | edge | Patient 360 follow-up list | empty list | flagged = [] | empty texts, KPIs 0, no error | 200 errors=0 empty texts=True | PASS |
| TC-RS-142 | edge | Patient 360 follow-up list | Unicode names, long text and words, nulls (PDF) | Arabic, Urdu, Chinese, accents; 1,800-char note; 225-letter word; null HbA1c, blank BP | every name drawn, nothing past the margin, nulls print — | 200 errors=0 pages=6 missing names=[] arabic=True overflow pages=[] | PASS |
| TC-RS-143 | edge | Patient 360 follow-up list | Unicode names (HTML) | same | every name in the HTML, fonts embedded | missing=[] @font-face=3 | PASS |
| TC-RS-144 | edge | Partner lab results | 50,000-row table | uploaded CSV, 50,000 rows | SUCCEEDED; long table drawn page by page; memory bounded | SUCCEEDED 987 pages in 2 s; media memory 804MiB / 4GiB -> 803.9MiB / 4GiB | PASS |
| TC-RS-145 | edge | Brain tumour MRI grading | 200 pictures | 200 rows (the dataset's 40 images, each 5 times) | SUCCEEDED, every row and grid cell drawn | SUCCEEDED, 33 pages, 83 distinct pictures, image ids printed 400 | PASS |
| TC-RS-146 | edge | Brain tumour MRI grading | bad pictures, rule "placeholder" | missing, text-as-jpg, truncated JPEG, 12.6 MB PNG, PDF-as-png (table + grid) | 10 boxes, a reason for each kind (not there, too large, damaged, not a picture), nothing blocks, no half picture | errors=[] boxes=10 reasons=['That image is not there, or not yours to read.', 'The image is 12.6 MB; at most 10 MB.', 'The image is damaged or incomplete (the file ends early); it', 'The image is not a PNG, JPEG or GIF p | PASS |
| TC-RS-147 | edge | Brain tumour MRI grading | bad pictures, grid rule "hide" | same, grid missing = hide | the grid leaves them out, no error | 200 errors=0 grid boxes=0 | PASS |
| TC-RS-148 | edge | Brain tumour MRI grading | bad pictures, grid rule "block" | same, grid missing = block | blocked: IMAGE_UNREADABLE errors | errors ['IMAGE_UNREADABLE'] | PASS |
| TC-RS-149 | layout | X-ray triage report | table header on every page | the 40-image table over several pages | "Image id" header on each | table pages [2, 3, 4, 5, 6, 7, 8], without header [] | PASS |
| TC-RS-150 | layout | X-ray triage report | keep together | rejected reviews (keepTogether) | its title and rows on one page | page 10, rows there=True | PASS |
| TC-RS-151 | layout | X-ray triage report | page numbers in the footer | 11 pages | every page numbered | numbered 11 of 11 | PASS |
| TC-RS-152 | layout | X-ray triage report | brand header on every page | workspace default profile | header on each page | 11 of 11 | PASS |
| TC-RS-153 | lifecycle | X-ray triage report | new draft from v1, change, publish v2 | newDraft, saveDraft (title), publish | v2 current; v1 unchanged | current v2, v1 title 'Chest X-ray triage · DRAFT for clinician' | PASS |
| TC-RS-154 | lifecycle | X-ray triage report | make a copy | copy of v1 | a new draft template, origin COPY | DRAFT origin=COPY ref=01M5BZNB5RNE4APX9R788WJMYT@v1 | PASS |
| TC-RS-155 | lifecycle | X-ray triage report | export JSON, import it | v2 exported, imported as a new template | the same definition | equal=True | PASS |
| TC-RS-156 | lifecycle | X-ray triage report | archive | the copy | gone from the list, in the archived list | in list=False in archived=True | PASS |
| TC-RS-157 | lifecycle | X-ray triage report | lineage | report v2 | parent v1, template version, data snapshot named | parent=1 template v1 snapshot=5 files: summary, latest, byClass, confusion, reviewed · Pip | PASS |
| TC-RS-158 | brand | Hospital readmission risk | report in another brand profile | 'E2E wound clinic brand mvg6yhuf' vs the default | header/footer differ, template the same | default header line: 'WOUND CARE QUALITY / October 2026'; other: 'October 2026' | PASS |
| TC-RS-159 | brand | Hospital readmission risk | locked confidentiality wins | template says "Confidential · DRAFT for clinician review", the profile locks its own | the profile's line prints | template's line printed=False; profile line printed=True | PASS |
| TC-RS-160 | isolation | all | Meridian admin (4643) on Riverside ids | 48 probes: templates, versions, export, thumbnails, preview, generate, reports, download links, verify, approve, samples, uploads | every one "not found" (404) | 48 of 48 404; others [] | PASS |
| TC-RS-161 | roles | all | viewer (4642) | templates list, reports list, preview | refused (403) | [403, 403, 403] | PASS |
| TC-RS-162 | roles | all | reviewer (4641): read-only + approve | read reports, create, generate (approve: phase 2) | reads; create and generate refused | {'read reports': 200, 'create template': 403, 'generate': 403} | PASS |
| TC-RS-163 | roles | all | platform administrator (4639): read-only designer | list, save draft, generate, canvas without data | reads and draws; save and generate refused | {'templates (Riverside)': 200, 'save draft': 403, 'generate': 403, 'canvas (structure)': 200} | PASS |
| TC-RS-164 | brand | X-ray triage report | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-165 | brand | Ultrasound findings report | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-166 | brand | Brain tumour MRI grading | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-167 | brand | Diabetic retinopathy grading | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-168 | brand | Hospital readmission risk | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-169 | brand | Patient 360 follow-up list | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-170 | brand | Drug safety monitor | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-171 | brand | Partner lab results | made again in the updated default brand (v3), signed | brand profile v2 | header "RIVERSIDE HEALTH / ...", signed | SUCCEEDED v3 signed=None header='RIVERSIDE HEALTH / October 2026' | PASS |
| TC-RS-172 | data source | Wound assessment report | pipeline run output | none: the wound data is synthetic, no pipeline makes it | N/A | not applicable (covered by the eight pipeline templates) | PASS |
| TC-RS-173 | data source | Wound assessment report | bucket file | {"connector": "BUCKET_OBJECT", "bucket": "riverside-health-s3", "key": "reports-test/data/wound-october-2026.json"} | PDF preview, no blocking error | 200, 3 pages, 0 errors | PASS |
| TC-RS-174 | data source | Wound assessment report | upload | {"connector": "UPLOAD", "sourceId": "01M5C1VR1YJYTP5AFH0894MH3R"} | PDF preview, no blocking error | 200, 3 pages, 0 errors | PASS |
| TC-RS-175 | data source | Wound assessment report | pasted JSON | {"connector": "INLINE_JSON", "text": "{\"clinic\": \"Riverside wound clinic\", \"period\": \"October 2026\", \"summary\" | PDF preview, no blocking error | 200, 3 pages, 0 errors | PASS |
| TC-RS-176 | data source | Wound assessment report | saved sample | {"connector": "SAMPLE", "sampleId": "01M5BPGVNVS9CXKF6ZWAW2ZTF0"} | PDF preview, no blocking error | 200, 3 pages, 0 errors | PASS |
| TC-RS-177 | known bug | Wound assessment report | "L × W cm" column (the reported bug) | October wound clinic data | each "2.7 × 1.8" on one line, the header not split letter by letter | values on one line: 6 of 6; fragments []; header lines ['L\xa0×\xa0W cm'] | PASS |
| TC-RS-178 | generate | Wound assessment report | generate v1 | saved sample | SUCCEEDED | SUCCEEDED 3 pages | PASS |
| TC-RS-179 | sign | Wound assessment report | reviewer approves and signs | reviewer 4641 (once; a rerun finds it signed) | signed and verified | verified=True | PASS |
| TC-RS-180 | verify | Wound assessment report | openssl cms -verify | the signed PDF | Verification successful | CMS Verification successful | PASS |

### Cases that failed first (before the fix)

| Case | Before | Fix | After |
|---|---|---|---|
| Wound "L × W cm" column (the reported bug) | "2.7 / × / 1.8" over three lines, header word by word | B01 | each value on one line (TC known bug) |
| X-ray report from the run's five files | 500 INTERNAL_ERROR | B14 | SUCCEEDED, 11 pages |
| Bad pictures (missing, text-as-jpg, truncated, 12.6 MB, PDF-as-png) | one reason; truncated JPEG printed half grey | B20, B21 | 10 boxes, 4 reasons, nothing half drawn |
| Preview of the ultrasound report | 3 × IMAGE_UNREADABLE warnings (only the preview's 60-picture limit) | B15 | one PREVIEW_IMAGES_LIMITED note |
| Partner lab results, normal result | EMPTY_TABLE warning on "Outside the reference range" | B16 | no warning, empty text |
| Unicode PDF check, copy/archive rerun | test-script issues (a name split over two lines; rerun on an archived copy) | script fixed | PASS |

## Known-good outputs (TC-RG)

| Id | Set | Template | Data case | Expect |
|---|---|---|---|---|
| TC-RG-01 | medical | wound | wound | renders as known good |
| TC-RG-02 | medical | discharge | discharge | renders as known good |
| TC-RG-03 | medical | lab | lab | renders as known good |
| TC-RG-04 | medical | readmissions | readmissions | renders as known good |
| TC-RG-05 | medical | medsafety | medsafety | renders as known good |
| TC-RG-06 | medical | radiology | radiology | renders as known good |
| TC-RG-07 | medical | readmissions | readmissions.csv | renders as known good |
| TC-RG-08 | medical | medsafety | medsafety.csv | renders as known good |
| TC-RG-09 | medical | discharge | discharge.unicode | renders as known good |
| TC-RG-10 | medical | discharge | discharge.longtext | renders as known good |
| TC-RG-11 | medical | discharge | discharge.nulls | renders as known good |
| TC-RG-12 | medical | discharge | discharge.no-mrn | blocked (REQUIRED_FIELD_MISSING) |
| TC-RG-13 | medical | lab | lab.normal | renders as known good |
| TC-RG-14 | medical | wound | wound.bad-images | renders as known good |
| TC-RG-15 | medical | homehealth | homehealth | renders as known good |
| TC-RG-16 | pipelines | xray | xray | renders as known good |
| TC-RG-17 | pipelines | ultrasound | ultrasound | renders as known good |
| TC-RG-18 | pipelines | brain | brain | renders as known good |
| TC-RG-19 | pipelines | retina | retina | renders as known good |
| TC-RG-20 | pipelines | readmission | readmission | renders as known good |
| TC-RG-21 | pipelines | patient360 | patient360 | renders as known good |
| TC-RG-22 | pipelines | drugsafety | drugsafety | renders as known good |
| TC-RG-23 | pipelines | labs | labs | renders as known good |
| TC-RG-24 | pipelines | xray | xray.no-summary | blocked (REQUIRED_FIELD_MISSING) |
| TC-RG-25 | pipelines | xray | xray.no-rejections | renders as known good |
| TC-RG-26 | pipelines | patient360 | patient360.unicode-long-nulls | renders as known good |
| TC-RG-27 | pipelines | patient360 | patient360.empty | renders as known good |
| TC-RG-28 | pipelines | brain | brain.bad-images | renders as known good |
| TC-RG-29 | pipelines | brain | brain.200-images | renders as known good |
| TC-RG-30 | pipelines | labs | labs.abnormal | renders as known good |
| TC-RG-31 | pipelines | labs | labs.no-test-name | blocked (REQUIRED_FIELD_MISSING) |

HTML/PDF parity (parity.py): ≥ 90 % of the first page's text fragments identical in Chromium and the PDF for every case; two known variances are reported, not failed: a 60-sentence paragraph (one word can move at a line end: the PDF engine rounds 10pt to 10.0125pt) and Arabic/CJK names (RTL extraction order; CJK not embedded in HTML). HTML sizes: +38-48 KB of fonts for a Latin report (+95 KB with Noto Serif headings, +370-430 KB with Arabic).

## End to end (TC-RE, console Playwright)

- TC-RE-01 `report-studio-designer.spec.ts`: new template → heading, text, table bound to test data, picture; reorder, undo/redo, autosave; test with pasted JSON (page count); publish
- TC-RE-02 `report-studio-reports.spec.ts`: Create report: missing field blocks Generate, matched passes, preview, generate v1 (PDF + HTML)
- TC-RE-03 `report-studio-reports.spec.ts`: Generate again → v2, v1 kept, lineage
- TC-RE-04 `report-studio-reports.spec.ts`: approve: the generator cannot (APPROVAL_NOT_ALLOWED), the reviewer signs (Signed chip)
- TC-RE-05 `report-studio-reports.spec.ts`: verify by version, by uploaded file, one flipped byte → not verified
- TC-RE-06 `report-studio-assets.spec.ts`: asset upload (PNG) approved; a PDF renamed .png refused
- TC-RE-07 `report-studio-assets.spec.ts`: brand profile: create, colours, low contrast blocks publish, publish v1, make default (and give the default back)
- TC-RE-08 `report-studio-access.spec.ts`: Meridian admin: 404 on every Riverside id, screens say "No such …"
- TC-RE-09 `report-studio-access.spec.ts`: viewer: every Report Studio route → unauthorized
- TC-RE-10 `report-studio-access.spec.ts`: reviewer: reads and approves; no generate/archive/designer
- TC-RE-11 `report-studio-access.spec.ts`: platform administrator: designer read-only

## Bugs found and fixed

| Id | Found | Fix | Commit |
|---|---|---|---|
| B01 | Wound report PDF: "L × W cm" values broke over three lines ("2.7 / × / 1.8"), the header word by word; the same class everywhere: "500 / mg", "21 Oct / 2026", "mL/min/1. / 73m²", "ACC-26- / 104411", "CRITICAL / ▲", "BMI >= / 30" | Table columns planned from their contents (Noto Sans widths), short values with a digit never broken, number+unit and operators glued, a too-wide table steps down to 90 %/80 % type before any word breaks | media 7db809f, e79e89c |
| B02 | The DRAFT watermark was drawn over the page and hid the words it crossed | Watermark behind the content (z-index) | media 7db809f |
| B03 | A text bound to a field ignored markdown ("**Presentation.**" printed) and merged its paragraphs | Bound text keeps paragraphs/line breaks and markdown; its "{{…}}" stay text | media 7db809f |
| B04 | Image grid with missing = hide left empty cells; rows without a picture warned | The grid closes up; no warning for a row naming no picture | media 7db809f |
| B05 | Chinese names printed "###" in every block; Arabic printed "###" in a Noto Serif heading | Every font-family list ends with the PDF fallbacks (Arabic, CJK, DejaVu) | media 7db809f |
| B06 | CSV / row-shaped data: every data-contract field read "not in this data", so a CSV source could never generate | Contract checked on the rows (required = present in every row) | media 7db809f |
| B07 | "Image not available" broke letter by letter in a narrow picture cell | Placeholder sized for the cell | media 7db809f |
| B08 | A table in a half-width column was planned on the page width: values overlapped ("age [80-90)" over "17,197"), headers split mid-word | Tables plan on their column's width | media e79e89c |
| B09 | Long-text columns (clinician notes) squeezed to one word a line | A readable minimum width for sentence columns | media e79e89c |
| B10 | A blank CSV cell ignored the column's empty text | Blank cells print the empty text | media e79e89c |
| B11 | Owner: "html view not show the same view for pdf" -- system font, other sizes, one fluid sheet | Embedded Noto subsets (≈40 KB), A4 sheets with the template margins, page breaks as sheets, print CSS, font-src data: | media 3e1cb7d |
| B12 | Browser and PDF engine read table widths differently (columns 1-2 mm apart, different wrapping) | Widths on <col>, written per engine | media 3e1cb7d |
| B13 | A no-wrap span in running text made the PDF break the line half a line early | Spans removed; no-break spaces only | media 3e1cb7d |
| B14 | Generating from the X-ray outcomes' five files answered 500 (bundle label longer than the snapshot column) | Short bundle label (≤160) | media 502aa0d |
| B15 | A preview past 60 pictures reported IMAGE_UNREADABLE three times | One PREVIEW_IMAGES_LIMITED note | media 502aa0d |
| B16 | A filtered table with no match warned EMPTY_TABLE | No warning; its empty text prints | media 502aa0d |
| B17 | Overview: "this month" from UTC midnight; "N have draft changes" counted never-published templates; failures made good later still listed | Month in Chicago; published only; superseded failures dropped | media 2c670a8 |
| B18 | Preview of a missing required value printed only "—" | "missing: <path>" in red on the page | media 2c670a8 |
| B19 | Empty canvas: long placeholder paths ran into the next column | Wrap inside their column | media 2c670a8 |
| B20 | Five different bad pictures gave one warning (the first reason) | One warning per reason | media 2f386f3 |
| B21 | A truncated JPEG printed as a half-grey wound photograph | Refused as damaged (missing rule applies) | media f600465 |
| B22 | Lineage / samples could not show a bundle's parts | Snapshot sourceRef + sourceKind, sample parts | media 50634a4 |
| B23 | Riverside's default brand (test data) printed "WOUND CARE QUALITY" on every report | Brand profile v2: "RIVERSIDE HEALTH / {{report.period}}" | data (brand profile v2) |
| B24 | Console: Report Studio times in the browser's zone (Berlin +7 h), grey callouts/chips, cut selects, overlapping tag, 1024 toolbar, 4.23:1 contrast, PA spinner, 72 vs 49 schedules ... (design check, screens 1-10) | Fixed item by item (see design-check) | console 95360a6f … a2351551 |
| B25 | Console: flaky "New registry task" pin (lazy navigation race), sessionStorage leaking between specs, developer-portal timeout | Harness waits for navigation; sessionStorage cleared per visit; one test's budget | console 5fa0e10d, a6dd2849, f87f0ad3 |
| B26 | Wipe dry run: three unclassified tables | api_client_change T, run_pricing_fact T, rate_card_draft platform (filter keeps drafts of kept cards) | etl-platform f8d1bdf |

## Added while testing (opt-in, existing templates unchanged)

- Several files as one report's data (BUNDLE) -- for pipelines whose output is several files (media e79e89c; console 34fac65d, 6353e439)
- Row filters (table, image grid, list, label-value), label-value field of the first row, "count" format (media e79e89c; console 33f864ee)
- Soft tints, chips (style and column), label-value emphasis normal, ISO dates in text in the date style (lead's list) (media 3e1cb7d; console 33f864ee)
- Create report: passed checks listed by name (console b8edd3df)

## Deferred (later phases or outside Report Studio)

- Charts and KPI blocks (phase 4) -- the KPIs here are label-values reading summary rows, filters and counts
- GENERATE_REPORT pipeline step (phase 5)
- AI suggestions in the designer (phase 6)
- Approval workflow in the Task inbox; Invoice template read-only (phase 7)
- Create report "Save draft and close" (needs a report draft on the server; the console shows Cancel)
- CJK text in the HTML output uses the viewer's fonts (the CJK collection cannot be cut down here); the PDF embeds it
- Platform administrator's Data tab lists 8 platform buckets (storage gives no tenant filter) -- storage-side
- Designer canvas keeps the console's fonts (shadow-root @font-face); the preview/report HTML is exact

## Test data left in Riverside

Templates: the eight pipeline templates above (X-ray triage v2 published), "X-ray triage report (imported, QA)", archived copies "X-ray triage report (copy, QA …)", "Wound assessment report" (existing). Reports RPT-0012 … RPT-0019 (one per pipeline, v1-v3, v1 and v3 signed by the reviewer) and the wound report, the edge-case reports (50,000-row labs, 200-picture brain MRI, another-brand readmission), uploads "… latest run (QA upload)" and "Partner lab results · 50,000 synthetic rows (QA)", bad pictures in reports-test/bad/, reports-test/data/wound-october-2026.json, brand profile "Riverside Health · Default" v2. The e2e specs add "E2E …" items each run.
