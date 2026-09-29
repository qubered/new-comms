import { useEffect, useState, type ReactNode } from "react";

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

export function TopBar({ tone, text, children }: { tone: "" | "wait" | "warn"; text: string; children?: ReactNode }) {
  const time = useClock();
  return (
    <div className="top">
      <div className={`st ${tone}`}>
        <span className="dot" />
        <span>{text}</span>
      </div>
      <span className="sp" />
      <span className="num">{time}</span>
      {children}
    </div>
  );
}
