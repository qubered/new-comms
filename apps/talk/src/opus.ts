/** Disable Opus DTX and request 10 ms uplink packets, including for silent stations. */
export function continuousOpus(sdp: string): string {
  const opus = [...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000[^\r\n]*/gim)].map(
    (match) => match[1]!,
  );
  let result = sdp;
  for (const payload of opus) {
    const pattern = new RegExp(`^a=fmtp:${payload} ([^\\r\\n]*)`, "m");
    const previous = result.match(pattern)?.[1];
    const parameters = (previous ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !/^(usedtx|minptime)=/i.test(part));
    parameters.push("usedtx=0", "minptime=10");
    const line = `a=fmtp:${payload} ${parameters.join(";")}`;
    result =
      previous === undefined
        ? result.replace(
            new RegExp(`(^a=rtpmap:${payload} [^\\r\\n]*)(\\r?\\n)`, "m"),
            `$1$2${line}$2`,
          )
        : result.replace(pattern, line);
  }
  return result
    .replace(/^a=ptime:\d+\r?\n/gm, "")
    .replace(/^(m=audio [^\r\n]*\r?\n)/gm, "$1a=ptime:10\r\n");
}
