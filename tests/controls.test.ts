import { describe, expect, test } from 'vitest';
import sample from '../src/data/project.json';
import type { Project } from '../src/data/schema';
import { orthoFrustum, perspectiveFitDistance, roomExtents } from '../src/scene/controls';

const room = (sample as unknown as Project).room; // 4200 × 5000 × 2700, walls 100

describe('roomExtents', () => {
  test('centre is the middle of the interior in world metres (north is -Z)', () => {
    const e = roomExtents(room);
    expect(e.center.x).toBeCloseTo(2.1, 12);
    expect(e.center.z).toBeCloseTo(-2.5, 12);
  });

  test('footprint includes the walls on both sides; height is the room height', () => {
    const e = roomExtents(room);
    expect(e.width).toBeCloseTo(4.4, 12);
    expect(e.length).toBeCloseTo(5.2, 12);
    expect(e.height).toBeCloseTo(2.7, 12);
  });
});

describe('perspectiveFitDistance', () => {
  test('fits a sphere into the vertical field of view on wide screens', () => {
    expect(perspectiveFitDistance(1, 90, 2)).toBeCloseTo(Math.SQRT2, 12);
  });

  test('uses the narrower horizontal field of view on portrait screens', () => {
    const halfH = Math.atan(Math.tan(Math.PI / 6) * 0.5); // vertical fov 60°, aspect 0.5
    expect(perspectiveFitDistance(2, 60, 0.5)).toBeCloseTo(2 / Math.sin(halfH), 12);
    expect(perspectiveFitDistance(2, 60, 0.5)).toBeGreaterThan(perspectiveFitDistance(2, 60, 1));
  });
});

describe('orthoFrustum', () => {
  test('keeps the screen aspect ratio (no stretching)', () => {
    for (const aspect of [0.5, 1, 16 / 9, 3]) {
      const f = orthoFrustum(4.4, 5.2, aspect);
      expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(aspect, 12);
      expect(f.left).toBeCloseTo(-f.right, 12);
      expect(f.bottom).toBeCloseTo(-f.top, 12);
    }
  });

  test('the whole view rectangle fits on landscape and portrait screens', () => {
    for (const aspect of [0.4, 1, 2.5]) {
      const f = orthoFrustum(4.4, 5.2, aspect);
      expect(f.right - f.left).toBeGreaterThanOrEqual(4.4 - 1e-12);
      expect(f.top - f.bottom).toBeGreaterThanOrEqual(5.2 - 1e-12);
    }
  });

  test('is tight along the limiting side', () => {
    const wide = orthoFrustum(4, 2, 4); // height-limited
    expect(wide.top - wide.bottom).toBeCloseTo(2, 12);
    const tall = orthoFrustum(4, 2, 1); // width-limited
    expect(tall.right - tall.left).toBeCloseTo(4, 12);
  });
});
