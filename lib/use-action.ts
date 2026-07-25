"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Run a server action, surface its error as a toast + inline message, and
 * refresh the route on success. Every mutating panel in the app uses this so
 * error handling looks the same everywhere.
 */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    fn: () => Promise<ActionResult>,
    opts?: { successMessage?: string; onSuccess?: () => void }
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        if (opts?.successMessage) toast.success(opts.successMessage);
        opts?.onSuccess?.();
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return { run, pending, error, setError };
}
