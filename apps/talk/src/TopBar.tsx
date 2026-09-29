import { useEffect, useState } from "react";

export function useClock(): string {
  const format = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };
  const [time, setTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

export interface MenuItem {
  label: string;
  onClick(): void;
}

/** The chrome every screen shares: connection dot, system name, time, menu. */
export function TopBar({ tone, text, title, items }: { tone: "" | "wait" | "warn"; text: string; title?: string; items: MenuItem[] }) {
  const time = useClock();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="top">
        <div className={`st ${tone}`}>
          <span className="dot" />
          <span>{text}</span>
        </div>
        <span className="sp" />
        <span className="num">{time}</span>
        <button className="gear" aria-label="Menu" onClick={() => setOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="19" cy="12" r="1.4" />
          </svg>
        </button>
      </div>
      <div className={`sheet${open ? " on" : ""}`} onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
        <div className="card">
          {title && <h2>{title}</h2>}
          {items.map((item) => (
            <button
              key={item.label}
              className="btn"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
