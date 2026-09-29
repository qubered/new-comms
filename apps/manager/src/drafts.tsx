import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Drafts = Map<string, unknown>;
const Context = createContext<{
  drafts: Drafts;
  put(key: string, value: unknown): void;
  discard(key: string, expected?: unknown): void;
  pending: Set<string>;
  begin(key: string): boolean;
  end(key: string): void;
} | null>(null);

/** Keep unsaved edits above page/editor lifetimes. Never persist station PINs in browser storage. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Drafts>(() => new Map());
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  useEffect(() => {
    if (!drafts.size) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts.size]);
  return <Context.Provider value={{ drafts,
    put: (key, value) => setDrafts(previous => new Map(previous).set(key, value)),
    discard: (key, expected) => setDrafts(previous => {
      if (expected !== undefined && previous.get(key) !== expected) return previous;
      const next = new Map(previous); next.delete(key); return next;
    }),
    pending,
    begin: key => {
      if (pendingRef.current.has(key)) return false;
      pendingRef.current.add(key); setPending(new Set(pendingRef.current)); return true;
    },
    end: key => { pendingRef.current.delete(key); setPending(new Set(pendingRef.current)); },
  }}>{children}</Context.Provider>;
}

export function useDrafts() {
  const context = useContext(Context);
  if (!context) throw new Error('DraftProvider is required.');
  return context;
}

export function useDraft<T>(key: string, saved: T) {
  const { drafts, put, discard, pending, begin, end } = useDrafts();
  return {
    draft: (drafts.has(key) ? drafts.get(key) : saved) as T,
    dirty: drafts.has(key),
    setDraft: (value: T) => put(key, value),
    discard: (expected?: T) => discard(key, expected),
    busy: pending.has(key),
    begin: () => begin(key),
    end: () => end(key),
  };
}
