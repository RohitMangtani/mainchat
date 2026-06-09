"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, PlatformId } from "@/lib/types";
import { MessageRow } from "./MessageRow";
import { PLATFORM_META } from "./PlatformBadge";
import { ArrowDownIcon, PauseIcon, PlatformIcon, PlayIcon, TrashIcon } from "./icons";

const ALL_PLATFORMS: PlatformId[] = ["twitch", "kick", "x"];

export function ChatFeed({
  messages,
  paused,
  pendingCount,
  totalCount,
  onPause,
  onResume,
  onClear,
  filterToxic,
}: {
  messages: ChatMessage[];
  paused: boolean;
  pendingCount: number;
  totalCount: number;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  filterToxic: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [stuck, setStuck] = useState(true);
  // totalCount high-water mark at the moment the user was last at the bottom —
  // "N new" is a real message count, not a count of flush batches
  const [seenTotal, setSeenTotal] = useState(0);
  const [filters, setFilters] = useState<Set<PlatformId>>(new Set(ALL_PLATFORMS));
  // producer view: only audience questions (vibe engine tags them at ingest)
  const [questionsOnly, setQuestionsOnly] = useState(false);

  const missed = Math.max(0, totalCount - seenTotal);

  const visible = useMemo(() => {
    let list =
      filters.size === ALL_PLATFORMS.length
        ? messages
        : messages.filter((m) => filters.has(m.platform));
    if (questionsOnly) {
      list = list.filter((m) => m.vibe.tags.includes("question"));
    }
    return list;
  }, [messages, filters, questionsOnly]);

  // auto-scroll: stick to bottom unless the user scrolled up to read
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      setSeenTotal(totalCount);
    }
  }, [visible, totalCount]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickRef.current = nearBottom;
    setStuck(nearBottom);
    if (nearBottom) setSeenTotal(totalCount);
  };

  const jumpToLive = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setStuck(true);
    setSeenTotal(totalCount);
    if (paused) onResume();
  };

  const toggleFilter = (p: PlatformId) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        next.delete(p);
        if (next.size === 0) return new Set(ALL_PLATFORMS);
      } else {
        next.add(p);
      }
      return next;
    });
  };

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* feed header */}
      <header className="flex items-center gap-2 border-b hairline px-3 py-2.5">
        <h2 className="chyron text-[9px]">Mainchat</h2>
        <span className="tabular text-[10px] text-faint">{visible.length}</span>

        <div className="ml-auto flex items-center gap-1">
          {ALL_PLATFORMS.map((p) => {
            const active = filters.has(p);
            return (
              <button
                key={p}
                onClick={() => toggleFilter(p)}
                title={`${active ? "Hide" : "Show"} ${PLATFORM_META[p].name} messages`}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
                  active
                    ? "border-transparent bg-white/8 text-cream"
                    : "border-transparent text-faint opacity-50 hover:opacity-80"
                }`}
                style={active ? { color: PLATFORM_META[p].color } : undefined}
              >
                <PlatformIcon platform={p} className="h-3 w-3" />
              </button>
            );
          })}

          <div className="mx-1 h-4 w-px bg-white/10" />

          <button
            onClick={() => setQuestionsOnly((q) => !q)}
            title={questionsOnly ? "Show all messages" : "Show only audience questions"}
            className={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold transition-colors ${
              questionsOnly
                ? "bg-gold/20 text-gold"
                : "text-muted hover:bg-white/8 hover:text-cream"
            }`}
          >
            ?
          </button>
          <button
            onClick={paused ? onResume : onPause}
            title={paused ? "Resume feed" : "Pause feed"}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              paused ? "bg-gold/20 text-gold" : "text-muted hover:bg-white/8 hover:text-cream"
            }`}
          >
            {paused ? <PlayIcon className="h-3 w-3" /> : <PauseIcon className="h-3 w-3" />}
          </button>
          <button
            onClick={onClear}
            title="Clear feed"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/8 hover:text-blood"
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        </div>
      </header>

      {/* the unified feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5"
      >
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="flourish text-xl text-muted">waiting on the crowd…</p>
            <p className="text-[11px] leading-relaxed text-faint">
              Messages from every connected platform land here in real time.
              Quiet stream? Flip on Demo Mode in settings.
            </p>
          </div>
        ) : (
          visible.map((m) => <MessageRow key={m.id} msg={m} filterToxic={filterToxic} />)
        )}
      </div>

      {/* resume / new-messages pill */}
      {(paused || !stuck) && (pendingCount > 0 || missed > 0 || paused) && (
        <button
          onClick={jumpToLive}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 animate-rise items-center gap-1.5 rounded-full border border-gold/40 bg-ink-2/95 px-3.5 py-1.5 text-[11px] font-bold text-gold-soft shadow-[0_6px_24px_rgba(0,0,0,0.6)] backdrop-blur transition-transform hover:scale-105"
        >
          <ArrowDownIcon className="h-3 w-3" />
          {paused
            ? `Paused — ${pendingCount} held`
            : `${missed} new message${missed === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}
