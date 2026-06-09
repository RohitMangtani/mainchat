"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface TipState {
  x: number;
  y: number;
  /** flip below the anchor when too close to the top edge */
  below: boolean;
}

/**
 * Instant hover tooltip rendered into a body portal so it never clips
 * inside scroll containers. Zero delay by design — the brief asks for
 * "instantly shows" on hover.
 */
export function Hover({
  tip,
  children,
  className,
  block,
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  block?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<TipState | null>(null);

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 72;
    setState({
      x: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
      y: below ? r.bottom + 8 : r.top - 8,
      below,
    });
  }, []);

  const hide = useCallback(() => setState(null), []);

  // hide on scroll so the tooltip never floats detached from its anchor
  useEffect(() => {
    if (!state) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [state, hide]);

  return (
    <span
      ref={anchorRef}
      className={className}
      style={block ? { display: "block" } : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {state &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[200] -translate-x-1/2 animate-msg-in"
            style={{
              left: state.x,
              top: state.y,
              transform: `translate(-50%, ${state.below ? "0" : "-100%"})`,
            }}
          >
            <div className="panel max-w-[260px] rounded-lg border-gold/20 bg-ink-2 px-3 py-2 text-[11px] leading-relaxed text-cream shadow-[0_8px_28px_rgba(0,0,0,0.55)]">
              {tip}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
