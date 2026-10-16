import './style.css';
import sampleProject from './data/project.json';
import type { Project } from './data/schema';
import { findIssues } from './scene/collisions';
import { ViewControls } from './scene/controls';
import { DragController } from './scene/drag';
import { FurnitureLayer } from './scene/furniture';
import { buildRoom, disposeObject } from './scene/room';
import { Viewer } from './scene/viewer';
import { DEFAULT_GRID_STEP, moveItem, removeItem, rotateItem } from './state/furnitureOps';
import { ProjectStore } from './state/store';
import { getSafeStorage, loadInitialProject } from './utils/storage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing');

const { project, warnings } = loadInitialProject(getSafeStorage(), sampleProject as unknown as Project);
// Temporary: surfaced in the UI by Task 10.
for (const w of warnings) console.warn(w);

const store = new ProjectStore(project);

const viewport = document.createElement('div');
viewport.className = 'viewport';
app.appendChild(viewport);
const viewer = new Viewer(viewport);
const canvas = viewer.renderer.domElement;

const controls = new ViewControls(viewer, canvas);
controls.fitToRoom(project.room);

const showCeiling = false;
// Temporary: Task 10 moves it into the UI state (toolbar input).
let gridStep = DEFAULT_GRID_STEP;
let roomGroup = buildRoom(project.room, project.openings, { showCeiling });
viewer.scene.add(roomGroup);

const furniture = new FurnitureLayer(viewer.scene);
let selectedId: string | null = null;
function syncFurniture(p: Project): void {
  furniture.sync(p.furniture, findIssues(p), selectedId);
}
syncFurniture(project);

function select(id: string | null): void {
  if (id === selectedId) return;
  selectedId = id;
  syncFurniture(store.get());
}

new DragController(canvas, controls, furniture, {
  onSelect: select,
  // moveItem snaps and returns the same project when nothing changed, so set() is a no-op then.
  onMove: (id, pos) => store.set(moveItem(store.get(), id, pos, gridStep)),
}, viewer.scene);

store.subscribe((p, prev) => {
  // The selected item may be gone (deleted, project imported).
  if (selectedId !== null && !p.furniture.some((f) => f.id === selectedId)) selectedId = null;
  // Issues depend on the room and openings too, so furniture re-syncs on every change.
  syncFurniture(p);
  if (p.room === prev.room && p.openings === prev.openings) return;
  viewer.scene.remove(roomGroup);
  disposeObject(roomGroup);
  roomGroup = buildRoom(p.room, p.openings, { showCeiling });
  viewer.scene.add(roomGroup);
  if (p.room !== prev.room) controls.fitToRoom(p.room);
});

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea') !== null);
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextInput(e.target)) return;
  if (e.key === 'Escape') {
    select(null);
    return;
  }
  if (selectedId === null) return;
  // `code`, not `key`: R must work on any keyboard layout (e.g. «К» on the Russian one).
  if (e.code === 'KeyR') {
    e.preventDefault();
    store.set(rotateItem(store.get(), selectedId, e.shiftKey ? -90 : 90));
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    // The subscriber clears the selection once the item is gone.
    store.set(removeItem(store.get(), selectedId));
  }
});
