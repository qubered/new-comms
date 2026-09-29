import { useEffect, useState } from "react";
import { canChooseSpeaker, deviceName, listDevices, loadPrefs, savePrefs, type DeviceLists } from "./audioPrefs.ts";
import type { Intercom } from "./intercom.ts";

/**
 * Pick the microphone and speaker. On the keys screen changes take effect straight away; on
 * the picker they are saved and used when you join.
 */
export function AudioDevices({ open, onClose, intercom, micAvailable }: { open: boolean; onClose(): void; intercom?: Intercom; micAvailable?: boolean }) {
  const [devices, setDevices] = useState<DeviceLists>({ inputs: [], outputs: [], labelled: false });
  const [prefs, setPrefs] = useState(loadPrefs());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrefs(loadPrefs());
    const refresh = () => void listDevices().then(setDevices);
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [open, micAvailable]);

  const chooseInput = async (id: string) => {
    setPrefs(savePrefs({ inputId: id || undefined }));
    if (!intercom) return;
    setBusy(true);
    await intercom.setInputDevice(id);
    setBusy(false);
  };
  const chooseOutput = async (id: string) => {
    setPrefs(savePrefs({ outputId: id || undefined }));
    await intercom?.setOutputDevice(id);
  };

  return (
    <div className={`sheet${open ? " on" : ""}`} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="card">
        <h2>Audio devices</h2>
        <label className="devfield">
          Microphone
          <select value={prefs.inputId ?? ""} disabled={busy} onChange={(e) => void chooseInput(e.target.value)}>
            <option value="">System default</option>
            {devices.inputs.map((device, i) => (
              <option key={device.deviceId} value={device.deviceId}>
                {deviceName(device, i, "Microphone")}
              </option>
            ))}
          </select>
        </label>
        {intercom && !micAvailable && (
          <div className="devnote warn">
            The microphone isn’t available, so you can listen but not talk.{" "}
            <button className="link" onClick={() => void intercom.acquireMic(prefs.inputId)}>
              Try again
            </button>
          </div>
        )}
        {canChooseSpeaker() ? (
          <label className="devfield">
            Speaker
            <select value={prefs.outputId ?? ""} onChange={(e) => void chooseOutput(e.target.value)}>
              <option value="">System default</option>
              {devices.outputs.map((device, i) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {deviceName(device, i, "Speaker")}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="devnote">This browser plays through whatever output the phone has chosen. Change it from the system audio controls.</div>
        )}
        {!devices.labelled && <div className="devnote">Device names appear once this browser has been allowed to use the microphone.</div>}
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
