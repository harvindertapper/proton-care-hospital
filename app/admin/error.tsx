"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl font-bold text-slate-800">Admin console error</h2>
      <p className="max-w-md text-slate-600">
        The administration panel hit an unexpected problem. Your session and data are intact.
        Please try again, and contact the super administrator if this persists.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
        >
          Try again
        </button>
        <a
          href="/admin"
          className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Back to admin
        </a>
      </div>
    </div>
  );
}
