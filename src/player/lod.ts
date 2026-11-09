import type { Quality } from '../scene/nature/GraphicsController';
export type AvatarDetail = 'near' | 'far';
export function avatarDetail(distance: number, quality: Quality, previous: AvatarDetail): AvatarDetail {
  const threshold = quality === 'low' ? 13 : quality === 'medium' ? 20 : 28;
  // Hysteresis giữ nhân vật không đổi model liên tục khi đứng sát ranh giới.
  return distance > threshold + (previous === 'near' ? 2 : -2) ? 'far' : 'near';
}
