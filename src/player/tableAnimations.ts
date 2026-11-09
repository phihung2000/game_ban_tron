import type { TableAction } from '../network/table';

export function sampleTableAction(action: TableAction | undefined, now: number) {
  const pose = { rightX: 0, rightZ: 0, leftX: 0, leftZ: 0, headX: 0,
    lean: 0, reach: 1, cup: false, snack: false, progress: 1, weight: 0 };
  if (!action) return pose;
  const age = now - action.startedAt;
  if (age < 0 || age >= action.durationMs) return pose;
  const progress = age / action.durationMs, weight = Math.min(1, age / 180, (action.durationMs - age) / 180);
  pose.progress = progress; pose.weight = weight;
  if (action.kind === 'pour' || action.kind === 'offer' || action.kind.startsWith('take-')) {
    pose.rightX = -1.4 * weight; pose.lean = 0.18 * weight; pose.reach = 1 + 1.2 * weight;
    pose.snack = action.kind.startsWith('take-') && progress >= 0.4;
  } else if (action.kind === 'drink') {
    pose.rightX = -2.1 * weight; pose.rightZ = 0.2 * weight; pose.headX = -0.16 * weight; pose.cup = true;
  } else if (action.kind === 'dump') {
    pose.rightX = -1.3 * weight; pose.rightZ = -0.8 * weight; pose.cup = true;
  } else if (action.kind === 'eat') {
    pose.rightX = -2.15 * weight; pose.headX = Math.sin(age / 90) * 0.05 * weight; pose.snack = progress < 0.75;
  } else if (action.kind === 'throw') {
    pose.rightX = (-2 + progress * 3.2) * weight; pose.rightZ = -0.6 * weight; pose.snack = progress < 0.25;
  }
  return pose;
}
