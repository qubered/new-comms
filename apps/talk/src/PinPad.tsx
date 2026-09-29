import { useState } from "react";
import { TopBar } from "./TopBar.tsx";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "⌫"];

export function PinPad({
  systemName,
  online,
  packName,
  verify,
  onBack,
  onAccepted,
}: {
  systemName: string;
  online: boolean;
  packName: string;
  verify(pin: string): Promise<boolean>;
  onBack(): void;
  onAccepted(pin: string): void;
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const press = async (key: string) => {
    if (busy) return;
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return setError("");
    }
    if (digits.length >= 4) return;
    const next = digits + key;
    setDigits(next);
    if (next.length < 4) return;
    setBusy(true);
    const ok = await verify(next).catch(() => false);
    if (ok) return onAccepted(next);
    setError("Wrong PIN");
    navigator.vibrate?.([20, 40, 20]);
    setTimeout(() => {
      setDigits("");
      setBusy(false);
    }, 450);
  };

  return (
    <section className="screen on">
      <TopBar tone={online ? "" : "wait"} text={online ? systemName : "Reconnecting…"} items={[{ label: "Back to packs", onClick: onBack }]} />
      <div className="pin">
        <div className="who">
          <b>{packName}</b>
          <span>PIN</span>
        </div>
        <div className={`dots ${error ? "err" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < digits.length ? "f" : ""} />
          ))}
        </div>
        <div className="msg">{error}</div>
        <div className="pad">
          {KEYS.map((key) =>
            key === "back" ? (
              <button key={key} className="ghost" onClick={onBack}>
                Back
              </button>
            ) : (
              <button key={key} onClick={() => void press(key)}>
                {key}
              </button>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
