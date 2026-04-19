"use client";

import { useEffect } from "react";

/**
 * iOS Safari's `100dvh` is supposed to update when the keyboard opens/closes
 * but frequently gets stuck at the keyboard-open size after dismiss, leaving
 * an empty strip below the layout. We set --app-h from window.innerHeight on
 * every resize (including visualViewport resize events) so the app shell
 * tracks the true viewport height.
 */
export function ViewportHeight() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const set = () => {
      document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
    };
    set();

    window.addEventListener("resize", set);
    window.addEventListener("orientationchange", set);
    window.visualViewport?.addEventListener("resize", set);

    return () => {
      window.removeEventListener("resize", set);
      window.removeEventListener("orientationchange", set);
      window.visualViewport?.removeEventListener("resize", set);
    };
  }, []);

  return null;
}
