# UI contract: C2 `my-items/new` (two steps)

All copy is English. Layout uses existing Astryx components, as in 010's `PhotoUploadScreen`.

## Step 1: Photos

- Heading: "Register clothing". Below it, "Step 1 of 2: Photos".
- File input (`multiple`, `accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"`), labeled "Clothing photos".
- Help text: "Add up to 10 JPG/JPEG, PNG, or WebP photos. Photos over 10 MB are compressed."
- Counter: "N / 10 photos". At 10, the text is "You have added 10 photos, the maximum." and [Add photo] is disabled.
- Skipped files: "M photos were not added because the limit is 10."
- Each item has a preview and a status line, announced through one `role="status"` region:

| Status | Text | Actions |
|--------|------|---------|
| waiting | "Waiting" | [Remove] |
| preparing | "Preparing photo…" | none (locked) |
| uploading | "Uploading photo…" | none (locked) |
| ready | the server image (`photo.url`); on load error "This photo could not be displayed." | [Remove] |
| failed | the error message (010 mapping); focus moves here | [Try again], [Remove] |

- Local rejects create no item and show the message at the input:
  - "Use a JPG/JPEG, PNG, or WebP photo."
  - "The chosen file is empty. Choose another photo."
  - "This photo is too large. Choose a smaller photo." (compression failed)
- [Next]: disabled unless at least 1 photo exists and all are ready. When any photo has failed, show "Some photos failed to upload. Try again or remove them."
- Event-level failures (closed, no access, not found) replace the screen exactly as in 010.

## Step 2: Details (placeholder in 012)

- "Step 2 of 2: Details". Ready photos are shown in order, with the first labeled "Main photo".
- Note: "You will describe your clothing and register it here in the next update."
- [Back] returns to step 1 with the photos kept.
