import type React from "react"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        preload?: string
        onDomReady?: () => void
      }
    }
  }
}

