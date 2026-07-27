"use client";

import { useState } from "react";
import { Contrast } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "a11y-high-contrast";
const CLASS_NAME = "a11y-high-contrast";

export function AccessibilityToggle() {
  // Matches the class already applied by the no-flash inline script in
  // app/layout.tsx before hydration; suppressHydrationWarning below covers
  // the resulting server/client mismatch on this element only.
  const [highContrast, setHighContrast] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains(CLASS_NAME)
  );

  function toggle() {
    const next = !highContrast;
    setHighContrast(next);
    document.documentElement.classList.toggle(CLASS_NAME, next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      suppressHydrationWarning
      aria-pressed={highContrast}
      aria-label={
        highContrast ? "Turn off high-contrast mode" : "Turn on high-contrast mode"
      }
      title="High-contrast mode"
      onClick={toggle}
    >
      <Contrast />
    </Button>
  );
}
