"use client";

import { useEffect, useRef, useState } from "react";
import type { AppConfig, PlatformId } from "@/lib/types";
import { MARKET_BUBBLE_DEFAULTS } from "@/lib/config";
import { PLATFORM_META } from "./PlatformBadge";
import { BubbleMark, CloseIcon, PlatformIcon } from "./icons";

function Toggle({
  on,
  onChange,
  accent = "#f5c400",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-5 w-9 shrink-0 rounded-full border transition-colors"
      style={{
        background: on ? `${accent}26` : "rgba(255,255,255,0.06)",
        borderColor: on ? `${accent}66` : "rgba(255,255,255,0.12)",
      }}
    >
      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all"
        style={{
          left: on ? "calc(100% - 16px)" : "3px",
          background: on ? accent : "#8e8c96",
        }}
      />
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="display-label block text-[9px] text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-0 px-3 py-2 font-mono text-[12px] text-cream outline-none transition-colors placeholder:text-faint focus:border-gold/50"
      />
      {hint && <span className="mt-1 block text-[10px] leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

/**
 * Slide-over settings. Changes apply live and persist to localStorage —
 * the hosts configure once and never touch it again.
 */
export function ConfigPanel({
  open,
  config,
  onChange,
  onClose,
}: {
  open: boolean;
  config: AppConfig;
  onChange: (c: AppConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const prevOpen = useRef(false);

  // edge-triggered: sync the draft only when the panel OPENS (a config change
  // landing mid-edit must never clobber in-progress keystrokes), and flush the
  // latest draft when it CLOSES (so a fast edit-then-close is never lost)
  useEffect(() => {
    if (open && !prevOpen.current) setDraft(config);
    if (!open && prevOpen.current) onChange(draftRef.current);
    prevOpen.current = open;
  }, [open, config, onChange]);

  // debounce-apply edits so typing a channel name doesn't reconnect per keystroke
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onChange(draftRef.current), 500);
    return () => clearTimeout(t);
  }, [draft, open, onChange]);

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value, brandPreset: "custom" as const }));

  const setEnabled = (p: PlatformId, v: boolean) =>
    setDraft((d) => ({ ...d, enabled: { ...d.enabled, [p]: v } }));

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col border-l hairline bg-ink-1 shadow-[-20px_0_60px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center gap-2 border-b hairline px-5 py-4">
          <h2 className="display-label text-[11px] text-gold">Configure</h2>
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/8 hover:text-cream"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* one-click show mode */}
          <button
            onClick={() => {
              setDraft(MARKET_BUBBLE_DEFAULTS);
            }}
            className="group flex w-full items-center gap-3 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3 text-left transition-all hover:border-gold/60 hover:bg-gold/12"
          >
            <BubbleMark className="h-9 w-9 shrink-0 text-gold transition-transform group-hover:scale-110" />
            <span>
              <span className="display-label block text-[10px] text-gold">
                Load Market Bubble Defaults
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                Banks + Ansem, Thursdays 1PM PT — channels pre-wired
              </span>
            </span>
          </button>

          {/* brand */}
          <section className="space-y-3">
            <Field
              label="Brand name"
              value={draft.brandName}
              placeholder="Your show"
              onChange={(v) => set("brandName", v)}
              hint="Shown in the header. Mainchat works for any streamer or podcast — just swap the channels below."
            />
          </section>

          {/* sources */}
          <section className="space-y-4">
            <p className="display-label text-[9px] text-faint">Sources</p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <PlatformIcon platform="twitch" className="mt-7 h-4 w-4 shrink-0" style={{ color: PLATFORM_META.twitch.color }} />
                <div className="flex-1">
                  <Field
                    label="Twitch channel"
                    value={draft.twitchChannel}
                    placeholder="fazebanks"
                    onChange={(v) => set("twitchChannel", v.replace(/^@|\s/g, ""))}
                  />
                </div>
                <span className="mt-7"><Toggle on={draft.enabled.twitch} onChange={(v) => setEnabled("twitch", v)} accent={PLATFORM_META.twitch.color} /></span>
              </div>

              <div className="flex items-start gap-3">
                <PlatformIcon platform="kick" className="mt-7 h-4 w-4 shrink-0" style={{ color: PLATFORM_META.kick.color }} />
                <div className="flex-1">
                  <Field
                    label="Kick channel"
                    value={draft.kickChannel}
                    placeholder="fazebanks"
                    onChange={(v) => set("kickChannel", v.replace(/^@|\s/g, ""))}
                  />
                </div>
                <span className="mt-7"><Toggle on={draft.enabled.kick} onChange={(v) => setEnabled("kick", v)} accent={PLATFORM_META.kick.color} /></span>
              </div>

              <div className="flex items-start gap-3">
                <PlatformIcon platform="x" className="mt-7 h-4 w-4 shrink-0 text-cream" />
                <div className="flex-1">
                  <Field
                    label="X source"
                    value={draft.xQuery}
                    placeholder="@MarketBubble"
                    onChange={(v) => set("xQuery", v)}
                    hint="An @handle joins that account's live broadcast chat — free, no API key. A search query instead streams matching posts (needs X_BEARER_TOKEN, see README)."
                  />
                </div>
                <span className="mt-7"><Toggle on={draft.enabled.x} onChange={(v) => setEnabled("x", v)} accent="#e9e9ec" /></span>
              </div>
            </div>
          </section>

          {/* behavior */}
          <section className="space-y-3">
            <p className="display-label text-[9px] text-faint">Vibe</p>

            <div className="flex items-center justify-between rounded-lg border border-white/8 bg-ink-0/50 px-3.5 py-3">
              <span>
                <span className="block text-[12px] font-bold text-cream">Demo mode</span>
                <span className="block text-[10px] text-muted">
                  Simulated crowd, clearly tagged — for trying the dashboard off-air
                </span>
              </span>
              <Toggle on={draft.demoMode} onChange={(v) => set("demoMode", v)} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/8 bg-ink-0/50 px-3.5 py-3">
              <span>
                <span className="block text-[12px] font-bold text-cream">Vibe shield</span>
                <span className="block text-[10px] text-muted">
                  AI toxicity filter — blurs the gutter, click any message to reveal
                </span>
              </span>
              <Toggle on={draft.toxicityFilter} onChange={(v) => set("toxicityFilter", v)} />
            </div>
          </section>
        </div>

        <footer className="border-t hairline px-5 py-3">
          <p className="text-center text-[10px] text-faint">
            Settings apply live and persist on this device
          </p>
        </footer>
      </aside>
    </>
  );
}
