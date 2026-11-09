export function rtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: [
    'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302',
  ] }];
  const urls = import.meta.env.VITE_TURN_URLS?.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (urls?.length) iceServers.push({ urls,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
  return { iceServers };
}
