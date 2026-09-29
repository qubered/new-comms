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
  const keys = pack.keys.map((key) => ({ key, channel: channels.find((c) => c.id === key.channelId) })).filter((k) => k.channel);
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
        <div className="none">No keys yet</div>
      )}
      <div className="cap">{pack.type === "hardware" ? "What this node is bound to" : "What they see on their phone"}</div>
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

export const defaultKeyFor = (channel: Channel): PackKey => ({ channelId: channel.id, mode: "auto", pgmListen: "always", volume: channel.type === "pgm" ? 70 : 80 });

export function relativeTime(timestamp?: number): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
