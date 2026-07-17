"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl font-bold text-slate-800">Something went wrong!</h2>
      <p className="max-w-md text-slate-600">
        We apologize for the inconvenience. The page could not be displayed. Please try again.
      </p>
      <button
        onClick={() => reset()}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
