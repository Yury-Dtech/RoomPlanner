import * as THREE from 'three';
import { worldToPlan, type Vec2 } from '../utils/units';
import type { ViewControls } from './controls';
import type { FurnitureLayer } from './furniture';

/** Pointer travel (CSS px) below which a press counts as a click, not a drag. */
export const DRAG_THRESHOLD_PX = 3;

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Client coordinates → normalized device coordinates of `rect` (x right, y up, −1…1). */
export function pointerToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): THREE.Vector2 {
  return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
}

/** Plan position (mm) where the ray meets the floor plane y = 0, or null if it never does. */
export function floorPlanPoint(ray: THREE.Ray): Vec2 | null {
  const hit = ray.intersectPlane(FLOOR, new THREE.Vector3());
  return hit ? worldToPlan({ x: hit.x, z: hit.z }) : null;
}

/** Offset from the grabbed floor point to the item centre, so the item does not jump to the pointer. */
export function grabOffset(itemPos: Vec2, grabPoint: Vec2): Vec2 {
  return { x: itemPos.x - grabPoint.x, z: itemPos.z - grabPoint.z };
}

/** Item centre for the current floor point under the pointer (unsnapped; `moveItem` snaps). */
export function draggedPosition(floorPoint: Vec2, offset: Vec2): Vec2 {
  return { x: floorPoint.x + offset.x, z: floorPoint.z + offset.z };
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
}

export interface DragCallbacks {
  onSelect(id: string | null): void;
  onMove(id: string, planPos: Vec2): void;
}

interface Press {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Item under the pointer at press time, or null for empty space. */
  itemId: string | null;
  /** Set while an item is being dragged (mouse/pen on an item). */
  drag: { id: string; offset: Vec2 } | null;
}

/**
 * Selection and dragging of furniture on the floor plane. A press on an item selects it;
 * with mouse/pen it also takes over from the orbit controls until release. Touch only
 * selects (mobile is view-only). A click on empty space (no movement) clears the selection.
 */
export class DragController {
  private readonly dom: HTMLElement;
  private readonly controls: ViewControls;
  private readonly layer: FurnitureLayer;
  private readonly cb: DragCallbacks;
  private readonly raycaster = new THREE.Raycaster();
  private press: Press | null = null;

  constructor(dom: HTMLElement, controls: ViewControls, layer: FurnitureLayer, cb: DragCallbacks) {
    this.dom = dom;
    this.controls = controls;
    this.layer = layer;
    this.cb = cb;
    // Capture phase: runs before OrbitControls' own pointerdown on the same element, so the
    // orbit is disabled before it starts tracking the pointer and never moves during a drag.
    dom.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancel);
    // Capture lost without a pointerup (e.g. the window lost focus): never leave the orbit off.
    dom.addEventListener('lostpointercapture', this.onPointerCancel);
  }

  dispose(): void {
    this.endPress();
    this.dom.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerCancel);
    this.dom.removeEventListener('lostpointercapture', this.onPointerCancel);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    // Only the primary button selects/drags; right/middle stay with the orbit (pan, zoom).
    if (this.press || !e.isPrimary || e.button !== 0) return;
    this.aim(e);
    const id = this.layer.pick(this.raycaster);
    const press: Press = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, itemId: id, drag: null };
    this.press = press;
    if (id === null) return;

    this.cb.onSelect(id);
    if (e.pointerType === 'touch') return;

    const mesh = this.layer.meshFor(id);
    const grab = floorPlanPoint(this.raycaster.ray);
    if (!mesh || !grab) return;
    const itemPos = worldToPlan({ x: mesh.position.x, z: mesh.position.z });
    press.drag = { id, offset: grabOffset(itemPos, grab) };
    this.controls.setEnabled(false);
    this.dom.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const press = this.press;
    if (!press || e.pointerId !== press.pointerId) return;
    this.trackMovement(press, e);
    if (!press.drag || !press.moved) return;

    this.aim(e);
    const point = floorPlanPoint(this.raycaster.ray);
    // Above the horizon the ray never meets the floor: keep the last position.
    if (point) this.cb.onMove(press.drag.id, draggedPosition(point, press.drag.offset));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    if (!press || e.pointerId !== press.pointerId) return;
    this.trackMovement(press, e);
    // A press on an item already selected it; only a still click on empty space clears it.
    if (press.itemId === null && !press.moved) this.cb.onSelect(null);
    this.endPress();
  };

  /** Also handles lostpointercapture, which follows a normal pointerup (press already ended). */
  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.press && e.pointerId === this.press.pointerId) this.endPress();
  };

  /** Once past the threshold a press stays a drag/orbit, even if the pointer comes back. */
  private trackMovement(press: Press, e: PointerEvent): void {
    if (!press.moved && exceedsDragThreshold(e.clientX - press.startX, e.clientY - press.startY)) press.moved = true;
  }

  private endPress(): void {
    const press = this.press;
    if (!press) return;
    this.press = null;
    if (!press.drag) return;
    if (this.dom.hasPointerCapture(press.pointerId)) this.dom.releasePointerCapture(press.pointerId);
    this.controls.setEnabled(true);
  }

  private aim(e: PointerEvent): void {
    const ndc = pointerToNdc(e.clientX, e.clientY, this.dom.getBoundingClientRect());
    this.raycaster.setFromCamera(ndc, this.controls.camera);
  }
}
