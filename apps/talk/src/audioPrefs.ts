// The microphone and speaker a browser picked, remembered per device (not per pack).

const KEY = "talk.audio";

export interface AudioPrefs {
  inputId?: string;
  outputId?: string;
}

export function loadPrefs(): AudioPrefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as AudioPrefs;
  } catch {
    return {};
  }
}

export function savePrefs(patch: AudioPrefs): AudioPrefs {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the choice lasts until reload */
  }
  return next;
}

/** Safari (and so every iPhone browser) cannot route to a chosen speaker; the OS decides. */
export function canChooseSpeaker(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

export interface DeviceLists {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  /** Names are blank until the browser has been given microphone permission once. */
  labelled: boolean;
}

export async function listDevices(): Promise<DeviceLists> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications");
    const outputs = devices.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
    return { inputs, outputs, labelled: inputs.some((d) => d.label !== "") };
  } catch {
    return { inputs: [], outputs: [], labelled: false };
  }
}

export const deviceName = (device: MediaDeviceInfo, index: number, kind: string) => device.label || `${kind} ${index + 1}`;
