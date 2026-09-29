import { useEffect, useState } from "react";
import type { Port } from "@comms/protocol";
import { useShowState } from "@comms/protocol/react";
import { Intercom } from "./intercom.ts";
import { Latency } from "./Latency.tsx";
import { PackPicker } from "./PackPicker.tsx";
import { PinPad } from "./PinPad.tsx";
import { TalkScreen } from "./TalkScreen.tsx";

type View =
  | { screen: "pick" }
  | { screen: "pin"; packId: string; intercom: Intercom }
  | { screen: "talk"; packId: string; intercom: Intercom };

export function App() {
  const { state, online, levels } = useShowState();
  const [view, setView] = useState<View>({ screen: "pick" });

  const leave = () => {
    if (view.screen !== "pick") view.intercom.stop();
    setView({ screen: "pick" });
  };

  // If the pack we are on is deleted in Manager, go back to the picker.
  useEffect(() => {
    if (
      state &&
      view.screen !== "pick" &&
      !state.ports.some(
        (pack) => pack.id === view.packId && pack.type === "station",
      )
    ) {
      view.intercom.stop();
      setView({ screen: "pick" });
    }
  }, [state, view]);

  const pick = (pack: Port) => {
    // Audio must be unlocked inside this tap, before any await.
    const intercom = new Intercom(pack.id, undefined);
    intercom.unlockAudio();
    if (pack.hasPin)
      return setView({ screen: "pin", packId: pack.id, intercom });
    void intercom.start();
    setView({ screen: "talk", packId: pack.id, intercom });
  };

  const activeIntercom = view.screen === "pick" ? undefined : view.intercom;
  useEffect(() => () => activeIntercom?.stop(), [activeIntercom]);

  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    if (hash === "#latency" && view.screen !== "pick") {
      view.intercom.stop();
      setView({ screen: "pick" });
    }
  }, [hash, view]);
  useEffect(() => {
    const listener = () => setHash(location.hash);
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  const pack =
    view.screen === "pick"
      ? undefined
      : state?.ports.find((p) => p.id === view.packId);

  if (hash === "#latency") {
    return (
      <div className="phone">
        <Latency
          ports={state?.ports ?? []}
          onBack={() => (location.hash = "")}
        />
      </div>
    );
  }

  return (
    <div className="phone">
      {view.screen === "pick" || !pack || !state ? (
        <PackPicker
          name={state?.name ?? ""}
          online={online}
          loaded={Boolean(state)}
          ports={state?.ports ?? []}
          onPick={pick}
        />
      ) : view.screen === "pin" ? (
        <PinPad
          systemName={state.name}
          online={online}
          packName={pack.label}
          verify={async (pin) =>
            (
              await fetch(`/api/v2/ports/${pack.id}/pin`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ pin }),
              })
            ).ok
          }
          onBack={leave}
          onAccepted={(pin) => {
            void view.intercom.start(pin);
            setView({
              screen: "talk",
              packId: pack.id,
              intercom: view.intercom,
            });
          }}
        />
      ) : (
        <TalkScreen
          pack={pack}
          ports={state.ports}
          crosspoints={state.crosspoints}
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
