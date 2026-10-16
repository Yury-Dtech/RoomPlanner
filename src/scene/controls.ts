import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Room } from '../data/schema';
import { degToRad, mmToM, planToWorld, type Vec2 } from '../utils/units';
import type { Viewer } from './viewer';

export type ViewMode = 'perspective' | 'top';

const FOV_DEG = 50;
/** Just above the horizon: the camera never dips under the floor. */
const MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
/** From the room centre towards the perspective camera: south (+Z), a bit east, ~50° above
 * the floor — high enough for the near walls not to hide the interior. */
const PERSPECTIVE_DIRECTION = new THREE.Vector3(0.4, 1.3, 1).normalize();
/** Free space around the room in the top view (1.1 = 10 % extra). */
const TOP_FIT_MARGIN = 1.1;
/** The top camera is orthographic: its height only has to clear the walls. */
const TOP_CAMERA_HEIGHT_M = 50;

/** Room box in world metres: interior centre, outer footprint (walls included), height. */
export interface RoomExtents {
  center: Vec2;
  width: number;
  length: number;
  height: number;
}

export function roomExtents(room: Room): RoomExtents {
  return {
    center: planToWorld({ x: room.width / 2, z: room.length / 2 }),
    width: mmToM(room.width + 2 * room.wallThickness),
    length: mmToM(room.length + 2 * room.wallThickness),
    height: mmToM(room.height),
  };
}

/** Camera distance at which a sphere of `radius` fits the narrower of the two fields of view. */
export function perspectiveFitDistance(radius: number, fovDeg: number, aspect: number): number {
  const halfV = degToRad(fovDeg) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return radius / Math.sin(Math.min(halfV, halfH));
}

/** Symmetric orthographic frustum with the screen's aspect that contains a `width × height` rectangle. */
export function orthoFrustum(
  width: number,
  height: number,
  aspect: number,
): { left: number; right: number; top: number; bottom: number } {
  const halfH = Math.max(height / 2, width / 2 / aspect);
  const halfW = halfH * aspect;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

function aspectOf(width: number, height: number): number {
  return width > 0 && height > 0 ? width / height : 1;
}

/**
 * Two cameras driven by one OrbitControls. Perspective: orbit, zoom and pan, never below the
 * floor. Top: an orthographic camera looking straight down (north up) with rotation off —
 * the left button and one finger pan instead; this is the 2D plan view.
 */
export class ViewControls {
  readonly orbit: OrbitControls;

  private readonly viewer: Viewer;
  private readonly perspective = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 200);
  private readonly top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private mode: ViewMode = 'perspective';
  /** Orbit target of each mode, so switching back returns to where the user left off. */
  private readonly targets: Record<ViewMode, THREE.Vector3> = {
    perspective: new THREE.Vector3(),
    top: new THREE.Vector3(),
  };
  /** Rectangle (m) the top view must show at zoom 1; the frustum is rebuilt from it on resize. */
  private topView = { width: 10, length: 10 };
  private aspect: number;

  constructor(viewer: Viewer, dom: HTMLElement) {
    this.viewer = viewer;
    this.aspect = aspectOf(dom.clientWidth, dom.clientHeight);
    // Placeholders until fitToRoom: anything but a zero orbit radius.
    this.perspective.position.set(5, 5, 5);
    this.top.position.set(0, TOP_CAMERA_HEIGHT_M, 0);

    this.orbit = new OrbitControls(this.perspective, dom);
    this.orbit.maxPolarAngle = MAX_POLAR_ANGLE;
    this.orbit.minDistance = 0.5;
    this.orbit.maxDistance = 60;
    this.orbit.minZoom = 0.25;
    this.orbit.maxZoom = 12;

    // The viewer keeps the perspective aspect; the orthographic frustum is ours.
    viewer.onResize((w, h) => {
      this.aspect = aspectOf(w, h);
      this.updateTopFrustum();
    });
    this.updateTopFrustum();
    this.applyMode();
  }

  get camera(): THREE.Camera {
    return this.mode === 'top' ? this.top : this.perspective;
  }

  setMode(m: ViewMode): void {
    if (m === this.mode) return;
    this.targets[this.mode].copy(this.orbit.target);
    this.mode = m;
    this.applyMode();
  }

  /** Frames the whole room (walls included) in both cameras and resets the top-view zoom. */
  fitToRoom(room: Room): void {
    const e = roomExtents(room);
    const center = new THREE.Vector3(e.center.x, 0, e.center.z);

    // The orbit target is the floor centre, so the sphere must reach the top of the walls.
    const radius = Math.hypot(e.width / 2, e.length / 2, e.height);
    const distance = perspectiveFitDistance(radius, FOV_DEG, this.aspect);
    this.perspective.position.copy(center).addScaledVector(PERSPECTIVE_DIRECTION, distance);
    this.perspective.lookAt(center);
    this.targets.perspective.copy(center);

    this.top.position.set(center.x, TOP_CAMERA_HEIGHT_M, center.z);
    this.top.zoom = 1;
    this.topView = { width: e.width * TOP_FIT_MARGIN, length: e.length * TOP_FIT_MARGIN };
    this.updateTopFrustum();
    this.targets.top.copy(center);

    this.orbit.target.copy(this.targets[this.mode]);
    this.orbit.update();
  }

  /** Off while an item is dragged, so the camera stays still. */
  setEnabled(on: boolean): void {
    this.orbit.enabled = on;
  }

  dispose(): void {
    this.orbit.dispose();
  }

  private applyMode(): void {
    const isTop = this.mode === 'top';
    const cam = isTop ? this.top : this.perspective;
    this.orbit.object = cam;
    this.orbit.target.copy(this.targets[this.mode]);
    this.orbit.enableRotate = !isTop;
    this.orbit.mouseButtons.LEFT = isTop ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.orbit.touches.ONE = isTop ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.viewer.setCamera(cam);
    this.orbit.update();
  }

  private updateTopFrustum(): void {
    const f = orthoFrustum(this.topView.width, this.topView.length, this.aspect);
    this.top.left = f.left;
    this.top.right = f.right;
    this.top.top = f.top;
    this.top.bottom = f.bottom;
    this.top.updateProjectionMatrix();
  }
}
