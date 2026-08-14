# Apple Files / Document Client Import

Added a new `/clients/document-import` workflow and Dashboard **Import from Files** button.

## Workflow
- iPhone/iPad: tap **Choose Files** and select documents from Apple Files/iCloud Drive.
- Mac: choose files or drag/drop from Finder/iCloud Drive.
- Automatic text extraction for text PDFs and TXT files.
- Browser-side OCR for scanned PDFs and images (JPEG/PNG/HEIC/HEIF/WebP).
- Extracted CRM fields are shown in a mandatory review screen before a client is created.
- File routing can be reviewed/changed per document before save.
- On approval, the existing client intake action creates the client and existing document API stores each file in the selected CRM section.

## Privacy / data flow
Document scanning happens in the signed-in user's browser. The source files are not uploaded to the CRM until the user clicks **Create Client & Save Files**. OCR support loads PDF.js and Tesseract.js runtime assets from public CDNs, but the client documents themselves are processed locally in the browser.

## Important behavior
- First and last name must be confirmed before creation.
- OCR is best-effort and never silently creates a client without review.
- 20 files max per import, 10 MB per file (matches current document upload limit).
- PDF scanning is capped at the first 12 pages per document to keep iPhone/iPad performance reasonable.
