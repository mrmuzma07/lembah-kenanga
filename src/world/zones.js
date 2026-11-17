// Zone & Room Isolation System for Virtual Spaces.
// Defines Private Meeting Rooms, Focus Pods, and Open Collaborative Areas.
// In private spaces, participants communicate with 100% clarity and are isolated
// from outside participants (Gather.town / WorkAdventure model).

export const ZONE_TYPES = {
  OPEN: 'open',
  PRIVATE: 'private',
  QUIET: 'quiet',
};

/**
 * Pre-defined zones on the primary map ('valley').
 * Bounds are given in tile coordinates: c0 (col min), r0 (row min), c1 (col max), r1 (row max).
 */
export const VALLEY_ZONES = [
  {
    id: 'meeting_balai_desa',
    name: 'Ruang Rapat Utama (Balai Desa)',
    type: ZONE_TYPES.PRIVATE,
    bounds: { c0: 30, r0: 12, c1: 38, r1: 15 },
    color: 'rgba(79, 154, 41, 0.15)',
    borderColor: '#4f9a29',
  },
  {
    id: 'meeting_warung',
    name: 'Ruang Diskusi (Warung Kopi)',
    type: ZONE_TYPES.PRIVATE,
    bounds: { c0: 41, r0: 16, c1: 46, r1: 20 },
    color: 'rgba(200, 132, 58, 0.15)',
    borderColor: '#c8843a',
  },
  {
    id: 'meeting_pondok_rani',
    name: 'Ruang Kreatif (Pondok Rani)',
    type: ZONE_TYPES.PRIVATE,
    bounds: { c0: 13, r0: 25, c1: 18, r1: 29 },
    color: 'rgba(184, 67, 46, 0.15)',
    borderColor: '#b8432e',
  },
  {
    id: 'focus_dock',
    name: 'Focus Pod (Dermaga Pantai)',
    type: ZONE_TYPES.PRIVATE,
    bounds: { c0: 26, r0: 39, c1: 30, r1: 44 },
    color: 'rgba(63, 143, 214, 0.15)',
    borderColor: '#3f8fd6',
  },
  {
    id: 'quiet_garden',
    name: 'Quiet Area (Kebun)',
    type: ZONE_TYPES.QUIET,
    bounds: { c0: 2, r0: 10, c1: 8, r1: 16 },
    color: 'rgba(139, 90, 43, 0.1)',
    borderColor: '#8b5a2b',
  },
];

export const DEFAULT_OPEN_ZONE = {
  id: 'open_area',
  name: 'Area Terbuka',
  type: ZONE_TYPES.OPEN,
  bounds: null,
};

/**
 * Returns the zone containing tile coordinates (c, r).
 * @param {number} c - Tile column
 * @param {number} r - Tile row
 * @param {Array} zones - Custom zone array (defaults to VALLEY_ZONES)
 * @returns {object} Matching zone object or DEFAULT_OPEN_ZONE
 */
export function getZoneAt(c, r, zones = VALLEY_ZONES) {
  for (const z of zones) {
    if (!z.bounds) continue;
    const { c0, r0, c1, r1 } = z.bounds;
    if (c >= c0 && c <= c1 && r >= r0 && r <= r1) {
      return z;
    }
  }
  return DEFAULT_OPEN_ZONE;
}

/**
 * Renders subtle boundary lines and gentle ground highlight for active or nearby zones.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} camX
 * @param {number} camY
 * @param {object} activeZone
 * @param {number} tileSize
 * @param {Array} zones
 */
export function drawZones(ctx, camX, camY, activeZone, tileSize = 32, zones = VALLEY_ZONES) {
  const now = performance.now() / 1000;
  for (const z of zones) {
    if (!z.bounds || z.type === ZONE_TYPES.OPEN) continue;
    const { c0, r0, c1, r1 } = z.bounds;
    const zx = c0 * tileSize - camX;
    const zy = r0 * tileSize - camY;
    const zw = (c1 - c0 + 1) * tileSize;
    const zh = (r1 - r0 + 1) * tileSize;

    const isActive = activeZone && activeZone.id === z.id;

    // Floor tint
    ctx.fillStyle = isActive ? z.color.replace('0.15', '0.25') : z.color;
    ctx.fillRect(Math.round(zx), Math.round(zy), zw, zh);

    // Glowing border when player is inside the room
    ctx.save();
    ctx.strokeStyle = z.borderColor;
    if (isActive) {
      const pulse = 0.5 + Math.sin(now * 3) * 0.3; // Breathing glow
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.setLineDash([6, 4]);
    } else {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([4, 4]);
    }
    ctx.strokeRect(Math.round(zx) + 0.5, Math.round(zy) + 0.5, zw - 1, zh - 1);
    ctx.restore();
  }
}
