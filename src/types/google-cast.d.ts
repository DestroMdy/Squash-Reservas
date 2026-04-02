import type { HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "google-cast-launcher": HTMLAttributes<HTMLElement>;
    }
  }
}

export {};
