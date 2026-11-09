import { EMOTE_DURATION } from '../network/social';
import type { ActiveEmote } from '../network/social';

export function sampleEmote(emote: ActiveEmote | undefined, now: number) {
  const result = { leftX: 0, leftZ: 0, rightX: 0, rightZ: 0, headX: 0, bounce: 0, laugh: false };
  if (!emote) return result;
  const age = now - emote.startedAt, duration = EMOTE_DURATION[emote.kind];
  if (age < 0 || age >= duration) return result;
  const t = age / 1000;
  // Vào/ra mềm trong 180ms; mọi máy dùng cùng hàm chuyển động.
  const weight = Math.min(1, age / 180, (duration - age) / 180);
  if (emote.kind === 'wave') {
    result.rightZ = (2.3 + Math.sin(t * 13) * 0.4) * weight;
    result.rightX = -0.25 * weight;
  } else if (emote.kind === 'laugh') {
    result.bounce = Math.abs(Math.sin(t * 15)) * 0.1 * weight;
    result.headX = -0.22 * weight; result.laugh = true;
  } else if (emote.kind === 'nod') result.headX = Math.sin(t * 11) * 0.4 * weight;
  else if (emote.kind === 'clap') {
    const clap = (0.45 + 0.35 * Math.sin(t * 15)) * weight;
    result.leftX = result.rightX = -1.15 * weight;
    result.leftZ = -clap; result.rightZ = clap;
  }
  return result;
}
