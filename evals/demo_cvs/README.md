# Demo CV fixtures

Seven real resumes (3 DOCX + 3 matching PDFs + 1 standalone PDF) used
for the manual upload walkthrough, the `/api/cv/upload` happy-path
demo, and as a stable fixture set when exercising the chunker
end-to-end against non-synthetic input.

The synthetic CV seeded by `scripts/seed-eval-cv.ts` is the eval-suite
fixture (it's the one `user_eval_demo` is expected to have). The files
in this directory are for **manual** testing — upload one through the
UI to see the chunker/embedder/RAG pipeline light up with realistic
content.

## Files

| File | Persona | Format | Use it for |
| --- | --- | --- | --- |
| `cv1_senior_engineer_marcus_ellison.docx` | Senior Engineer, 8+ yrs TS/React/Next.js | DOCX | Strong match against the `frontend-engineer` benchmark; stress-test the chunker's experience sub-split |
| `cv1_senior_engineer_marcus_ellison.pdf`  | Same person as above | PDF  | Tests the `unpdf` parser path on the same content |
| `cv2_fresher_priya_nair.docx`             | New grad, 1 internship, Java + Python | DOCX | Weak-to-middling match against `frontend-engineer`; useful for the gap-analysis intent |
| `cv2_fresher_priya_nair.pdf`              | Same person as above | PDF  | PDF path on the same content |
| `cv3_basic_graduate_thomas_oduya.docx`    | Bootcamp grad, light projects | DOCX | Negative test — exercises the "needs-OCR / sparse-content" chunker paths |
| `cv.pdf`                                  | Anonymised sample CV | PDF  | Generic smoke test for the PDF path |

## How to use

1. Start the dev server: `npm run dev`
2. Sign in as a real user (or impersonate via the Clerk dashboard).
3. From `/dashboard/cv`, upload one of the three DOCX files.
4. Watch the chunk inspector populate; run `/api/cv/<id>/chunks` to
   inspect the persisted chunk inventory.

## Not the eval fixture

The eval suite uses `scripts/seed-eval-cv.ts` to insert a synthetic
CV directly into the `cvs` + `cv_chunks` tables (no upload, no
multipart). The reason: the eval must be deterministic and headless,
and the synthetic text is tuned to hit the `frontend-engineer`
benchmark must-haves. The DOCX files here are for the **demo path**,
not the eval path.
