# Demo CV fixtures

Three real DOCX resumes used for manual upload smoke tests, the
`/api/cv/upload` happy-path walkthrough, and as a stable fixture set
when exercising the chunker end-to-end against non-synthetic input.

The synthetic CV seeded by `scripts/seed-eval-cv.ts` is the eval-suite
fixture (it's the one `user_eval_demo` is expected to have). The three
files in this directory are for **manual** testing — upload one of
these through the UI to see the chunker/embedder/RAG pipeline light up
with realistic content.

## Files

| File | Persona | Use it for |
| --- | --- | --- |
| `cv1_senior_engineer_marcus_ellison.docx` | Senior Engineer, 8+ yrs TS/React/Next.js | Strong match against the `frontend-engineer` benchmark; stress-test the chunker's experience sub-split |
| `cv2_fresher_priya_nair.docx` | New grad, 1 internship, Java + Python | Weak-to-middling match against `frontend-engineer`; useful for the gap-analysis intent |
| `cv3_basic_graduate_thomas_oduya.docx` | Bootcamp grad, light projects | Negative test — exercises the "needs-OCR / sparse-content" chunker paths |

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
