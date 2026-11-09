export type MoveAxes = { x: number; z: number };
export function joystickAxes(dx: number, dy: number, radius = 48): MoveAxes {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { x: 0, z: 0 };
  const length = Math.hypot(dx, dy), magnitude = Math.min(1, length / radius);
  if (magnitude < .12) return { x: 0, z: 0 };
  return { x: dx / length * magnitude, z: dy / length * magnitude };
}
export class TouchInput {
  axes: MoveAxes = { x: 0, z: 0 };
  heading = Math.PI;
  set(x: number, z: number) { this.axes = joystickAxes(x, z, 1); }
  reset() { this.axes = { x: 0, z: 0 }; }
}
export function cameraRelativeAxes(axes: MoveAxes, heading: number): MoveAxes {
  const c = Math.cos(heading), s = Math.sin(heading);
  return { x: -c * axes.x - s * axes.z, z: s * axes.x - c * axes.z };
}
