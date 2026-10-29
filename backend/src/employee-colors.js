import { createHash } from 'node:crypto';

// The immutable user ID keeps colors stable across names, departments and views.
export function employeeColor(userId) {
  const hash = createHash('sha256').update(userId).digest();
  const hue = hash.readUInt16BE(0) / 65536;
  const saturation = 0.6 + (hash[2] / 255) * 0.2;
  const lightness = 0.35 + (hash[3] / 255) * 0.1;
  const channel = (offset) => {
    const k = (offset + hue * 12) % 12;
    const value =
      lightness -
      saturation * Math.min(lightness, 1 - lightness) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
