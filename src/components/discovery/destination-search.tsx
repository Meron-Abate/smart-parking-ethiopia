"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface PlaceOption {
  kind: "landmark" | "facility";
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

/**
 * Destination autocomplete (WAI-ARIA combobox). Queries /api/destinations/search with the TYPED text only;
 * it never reads the device location.
 */
export function DestinationSearch({
  initialValue = "",
  onSelect,
  autoFocus,
  id = "destination",
}: {
  initialValue?: string;
  onSelect: (p: PlaceOption) => void;
  autoFocus?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(initialValue);
  const [items, setItems] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const reqId = useRef(0);
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) return;
    const q = text.trim();
    if (q.length < 2) {
      setItems([]);
      setState("idle");
      return;
    }
    setState("loading");
    const mine = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/destinations/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (mine !== reqId.current) return; // a newer request superseded this one
        if (!res.ok) throw new Error(json.error?.message);
        setItems(json.data);
        setActive(-1);
        setState("done");
      } catch {
        if (mine === reqId.current) setState("error");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  function choose(p: PlaceOption) {
    touched.current = false;
    setText(p.name);
    setOpen(false);
    setItems([]);
    onSelect(p);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && items.length) {
      e.preventDefault();
      choose(items[active >= 0 ? active : 0]!);
    } else if (e.key === "Escape") setOpen(false);
  }

  const showPanel = open && text.trim().length >= 2 && state !== "idle";
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={text}
        placeholder="Building, mall, hotel, landmark or neighbourhood"
        onChange={(e) => {
          touched.current = true;
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        className="w-full min-h-12 rounded-md border border-border bg-card px-3 text-base placeholder:text-muted-foreground"
      />
      {showPanel && (
        <ul id={listId} role="listbox" className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
          {state === "loading" && items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Searching…</li>}
          {state === "error" && <li className="px-3 py-3 text-sm text-danger">Search is unavailable right now. Please try again.</li>}
          {state === "done" && items.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No match. Try a well-known nearby landmark, hotel or neighbourhood.</li>
          )}
          {items.map((p, i) => (
            <li
              key={`${p.kind}-${p.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              className={`cursor-pointer px-3 py-2.5 ${i === active ? "bg-muted" : "hover:bg-muted"}`}
            >
              <span className="block text-sm font-medium">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.subtitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
