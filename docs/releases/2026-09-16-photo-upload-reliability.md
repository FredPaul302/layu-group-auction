# Photo upload reliability — September 16, 2026

Live at https://market.layu.llc. Deployment completed successfully at 21:28:44 UTC and was verified at 21:29:42 UTC with 100% of production traffic on the new image. Existing runtime settings were preserved.

Release: `photo-upload-fix-20260916-02`, image digest `sha256:17595a111b7913834702704c46d52ab563cecbb28e020e43ee8a7ced871a42bf`. Previous image retained for rollback: `sha256:67887d5db38bbdadb883219d056ee8c805ae58823c50e48e6d463b7cdec65fd0`.

## Changes

- Raise photo limits from 8 MB to 20 MB in the inbox, bulk workspace, and listing editor. Raise bulk selections from 128 MB to 256 MB, retaining the 100-photo inbox limit.
- Upload inbox photos individually, read originals before sending, compare received sizes with the client manifest, and show filename, size, progress, individual results, and retry controls for failed entries. Successfully saved entries are excluded from retries.
- Separate empty files, unsupported formats, oversized photos, damaged transfers, sign-in failures, and network errors. Explain cloud-photo downloads and HEIC conversion in the inbox.
- Stream API multipart bodies to private, request-specific temporary files with bounded body, file, field, and count limits. Always clean temporary files after parsing failures or route completion. This avoids buffering large batches in memory. Retain the existing transaction and object cleanup behavior for listing creation and inbox saves.
- Align regular listing form and middleware body allowances with the advertised image limits, and allow multipart overhead above the 256 MB media allowance.

## Diagnosis and verification

The reported ten-photo batch was reproduced with synthetic JPEG files of 2,300,000 bytes each on the previous production image; that batch succeeded. The exact source of the user's rejection remains unconfirmed without the original files/device details. The previous generic error combined zero-byte files and oversized files and therefore did not identify which condition occurred.

A separate stress test at the new 256 MB limit exhausted a 1 GB container while using the old buffered multipart reader. The streaming reader addresses that verified memory failure; it is not claimed as the proven cause of the original 23 MB rejection.

Automated checks: lint, typecheck, 826 passing tests (11 optional database tests skipped), deployment configuration check, production build, and clean Docker build. Regression coverage includes ten 2.3 MB photos, original byte reads, partial transfer detection, interrupted requests, malformed responses, body and file limits without Content-Length, and temporary file cleanup.

The full 256 MB bulk request passed in a 1 GB container after the streaming change. Ten 2,300,000-byte JPEGs saved with byte-for-byte matching downloads. Browser checks confirmed ten successful inbox uploads, continued saving after an empty photo, retrying only the failed entry, and a 20 MB photo saved through the regular listing form. Temporary server upload directories were removed after the tests. Test listings, inbox records, and the isolated preview container/database were removed. Automatic approval review rejected deletion of the local fixture folder `D:\CodexBuildCache\layu-photo-upload-test-20260916`, so those generated test JPEG files remain.

Live deployment and final integration evidence are recorded in `.codex-work/photo-upload-fix-20260916/`.
