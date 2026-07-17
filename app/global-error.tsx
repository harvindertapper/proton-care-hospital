"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
          background: "#f8fafc",
          color: "#1e293b",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Something went wrong!
        </h2>
        <p style={{ maxWidth: "28rem", color: "#475569", margin: 0 }}>
          A critical error occurred while loading the application. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            borderRadius: "0.375rem",
            background: "#2563eb",
            color: "#fff",
            padding: "0.5rem 1rem",
            border: "none",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
