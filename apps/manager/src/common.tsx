import { useEffect, useState, type ReactNode } from "react";
import type { Channel, ChannelType, KeyMode, PackKey, PublicPack } from "@comms/protocol";

export const TYPE_LABEL: Record<ChannelType, string> = { partyline: "Partyline", direct: "Direct", pgm: "PGM" };
export const MODE_LABEL: Record<KeyMode, string> = { auto: "Tap/hold", ptt: "Hold", latch: "Tap" };
export const typeClass = (type: ChannelType) => (type === "partyline" ? "pl" : type);

/** Text input that saves when you leave it (or press Enter), not on every keystroke. */
export function DraftInput({
  value,
  onCommit,
  className = "in",
  ...rest
}: {
  value: string;
  onCommit(value: string): void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <input
      {...rest}
      className={className}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") {
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function useOnline(packId: string | undefined, live: Record<string, { connected: boolean }>) {
  return Boolean(packId && live[packId]?.connected);
}

/** What a pack's phone shows for a key: direct lines are headed with the other pack's name. */
export function keyHeading(channel: Channel, packId: string, packs: PublicPack[]): string {
  if (channel.type !== "direct") return channel.name;
  const other = channel.members.find((id) => id !== packId);
  return packs.find((pack) => pack.id === other)?.name ?? channel.name;
}

export function PhonePreview({
  pack,
  packs,
  channels,
  keyed,
  systemName,
}: {
  pack: PublicPack;
  packs: PublicPack[];
  channels: Channel[];
  keyed: Record<string, boolean>;
  systemName: string;
}) {
  const all = pack.keys.map((key) => ({ key, channel: channels.find((c) => c.id === key.channelId) })).filter((k) => k.channel);
  const hardware = pack.type === "hardware";
  // A phone shows buttons only; PGM mappings play straight into the pack.
  const keys = hardware ? all : all.filter(({ channel }) => channel!.type !== "pgm");
  const feeds = hardware ? [] : all.filter(({ channel }) => channel!.type === "pgm");
  return (
    <div className="preview">
      <div className="pt">
        <span>● {systemName}</span>
      </div>
      <div className="pn">{pack.name}</div>
      {keys.length ? (
        <div className="pg">
          {keys.map(({ key, channel }) => (
            <div key={key.channelId} className={`pkey ${typeClass(channel!.type)}${keyed[key.channelId] ? " hot" : ""}`}>
              <div className="n">{keyHeading(channel!, pack.id, packs)}</div>
              <div className="s">{channel!.subText ?? ""}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="none">{feeds.length ? "No buttons yet" : "No keys yet"}</div>
      )}
      {feeds.length > 0 && <div className="cap">Also hearing: {feeds.map(({ channel }) => channel!.name).join(", ")}</div>}
      <div className="cap">{hardware ? "What this node is bound to" : "What they see on their phone"}</div>
    </div>
  );
}

const TRIM_MAX = 24;
export const formatTrim = (db: number) => `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db).toFixed(db % 1 === 0 ? 0 : 1)} dB`;

/** Gain trim, -24 to +24 dB in half-dB steps. Saves when you let go, not on every pixel. */
export function TrimControl({ label, value = 0, disabled, onCommit }: { label: string; value?: number; disabled?: boolean; onCommit(db: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (db = draft) => db !== value && onCommit(db);
  return (
    <div className="trim">
      <input
        type="range"
        min={-TRIM_MAX}
        max={TRIM_MAX}
        step={0.5}
        value={draft}
        disabled={disabled}
        aria-label={label}
        style={{ "--v": `${((draft + TRIM_MAX) / (2 * TRIM_MAX)) * 100}%` } as React.CSSProperties}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => commit()}
        onKeyUp={() => commit()}
        onBlur={() => commit()}
      />
      <span className="num trim-v">{formatTrim(draft)}</span>
      <button className="btn quiet" disabled={disabled || draft === 0} onClick={() => (setDraft(0), commit(0))}>
        Reset
      </button>
    </div>
  );
}

export function Switch({ on, label, onClick }: { on: boolean; label: string; onClick(): void }) {
  return (
    <button className={`switch${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      <i />
      <span>{label}</span>
    </button>
  );
}

export function Head({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
      {action}
    </div>
  );
}

export const defaultKeyFor = (channel: Channel): PackKey => ({ channelId: channel.id, mode: "auto", volume: channel.type === "pgm" ? 100 : 80 });

/** Buttons are keys on partyline and direct channels; PGM mappings have no key and no level. */
export const isButton = (key: PackKey, channels: Channel[]) => channels.find((c) => c.id === key.channelId)?.type !== "pgm";
export const buttonCount = (pack: { keys: PackKey[] }, channels: Channel[]) => pack.keys.filter((key) => isButton(key, channels)).length;

export function relativeTime(timestamp?: number): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
