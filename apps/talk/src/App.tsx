import { useEffect, useState } from "react";
import type { PublicPack } from "@comms/protocol";
import { useServerState } from "@comms/protocol/react";
import { Intercom } from "./intercom.ts";
import { PackPicker } from "./PackPicker.tsx";
import { PinPad } from "./PinPad.tsx";
import { TalkScreen } from "./TalkScreen.tsx";

type View =
  | { screen: "pick" }
  | { screen: "pin"; packId: string; intercom: Intercom }
  | { screen: "talk"; packId: string; intercom: Intercom };

export function App() {
  const { state, online, levels } = useServerState();
  const [view, setView] = useState<View>({ screen: "pick" });

  const leave = () => {
    if (view.screen !== "pick") view.intercom.stop();
    setView({ screen: "pick" });
  };

  // If the pack we are on is deleted in Manager, go back to the picker.
  useEffect(() => {
    if (state && view.screen !== "pick" && !state.packs.some((pack) => pack.id === view.packId)) {
      view.intercom.stop();
      setView({ screen: "pick" });
    }
  }, [state, view]);

  const pick = (pack: PublicPack) => {
    // Audio must be unlocked inside this tap, before any await.
    const intercom = new Intercom(pack.id, undefined);
    intercom.unlockAudio();
    if (pack.hasPin) return setView({ screen: "pin", packId: pack.id, intercom });
    void intercom.start();
    setView({ screen: "talk", packId: pack.id, intercom });
  };

  const pack = view.screen === "pick" ? undefined : state?.packs.find((p) => p.id === view.packId);

  return (
    <div className="phone">
      {view.screen === "pick" || !pack || !state ? (
        <PackPicker
          name={state?.name ?? ""}
          online={online}
          loaded={Boolean(state)}
          packs={state?.packs ?? []}
          channels={state?.channels ?? []}
          onPick={pick}
        />
      ) : view.screen === "pin" ? (
        <PinPad
          packName={pack.name}
          verify={async (pin) => (await fetch(`/api/v1/packs/${pack.id}/pin`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin }),
          })).ok}
          onBack={leave}
          onAccepted={(pin) => {
            void view.intercom.start(pin);
            setView({ screen: "talk", packId: pack.id, intercom: view.intercom });
          }}
        />
      ) : (
        <TalkScreen
          pack={pack}
          packs={state.packs}
          channels={state.channels}
          live={state.live}
          levels={levels}
          systemName={state.name}
          intercom={view.intercom}
          onLeave={leave}
        />
      )}
    </div>
  );
}
