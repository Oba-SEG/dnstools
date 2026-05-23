"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="ndns-mark w-12 h-12 text-lg mx-auto mb-6">N</div>
        <h2 className="font-display text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-6">{error.message || "A client-side error occurred."}</p>
        <button onClick={reset} className="btn-primary px-6 py-3 rounded-xl text-sm">
          Try again
        </button>
      </div>
    </main>
  );
}
