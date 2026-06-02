import { UploadCloud, FileText } from "lucide-react";

export default function CVPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Your CV, decoded.
        </h1>
        <p className="mt-1 text-sm text-secondary-500">
          Upload a PDF or DOCX. We&apos;ll chunk, embed, and ground every
          assistant answer in it.
        </p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/40 p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-white">
          <UploadCloud className="h-5 w-5" />
        </span>
        <h2 className="font-heading mt-4 text-lg font-semibold">
          Drop your CV to get started
        </h2>
        <p className="mt-1 text-sm text-secondary-500">
          PDF or DOCX, up to 10MB. Multiple versions supported.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600"
        >
          Choose file
        </button>
      </div>

      <div className="rounded-2xl border border-secondary-100 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary-50 text-secondary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">No CVs uploaded yet</p>
            <p className="text-xs text-secondary-500">
              Your parsed chunks will appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
