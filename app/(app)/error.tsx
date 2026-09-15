"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Button, ErrorState } from "@/components/ui/primitives";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4">
      <ErrorState
        title="Something went wrong loading this page"
        message={error.message || "An unexpected error occurred. Your data is safe."}
      />
      <Button type="button" variant="secondary" onClick={reset}>
        <RotateCcw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
