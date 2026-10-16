import './style.css';
import catalogData from './data/catalog.json';
import sampleProject from './data/project.json';
import type { Project } from './data/schema';
import { validateCatalog } from './data/validate';
import { findIssues } from './scene/collisions';
import { ViewControls } from './scene/controls';
import { DragController } from './scene/drag';
import { FurnitureLayer } from './scene/furniture';
import { buildRoom, disposeObject } from './scene/room';
import { Viewer } from './scene/viewer';
import {
  DEFAULT_GRID_STEP,
  addItem,
  moveItem,
  recolorItem,
  removeItem,
  resizeItem,
  rotateItem,
} from './state/furnitureOps';
import { ProjectStore } from './state/store';
import { showErrors, showMessage } from './ui/notifications';
import { mountPropertiesPanel } from './ui/propertiesPanel';
import { mountToolbar, type UiState } from './ui/toolbar';
import { createAutosave } from './utils/autosave';
import { downloadProject, getSafeStorage, loadInitialProject, parseProjectFile, saveProject } from './utils/storage';

const AUTOSAVE_DELAY_MS = 300;
/** Project files are a few KB; anything this big is not one and would only freeze the tab. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const IMPORT_FAILED = 'Файл не загружен';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing in index.html`);
  return el;
}

const sample = sampleProject as unknown as Project;
const storage = getSafeStorage();
const { project, warnings } = loadInitialProject(storage, sample);
for (const w of warnings) showMessage(w, 'warn');

// A broken catalog must not take the planner down: it only disables adding furniture.
const catalogResult = validateCatalog(catalogData);
const catalog = catalogResult.ok ? catalogResult.value : [];
if (!catalogResult.ok) showErrors('Каталог мебели не загружен', catalogResult.errors);

const store = new ProjectStore(project);
const ui: UiState = { selectedId: null, gridStep: DEFAULT_GRID_STEP, showCeiling: false, viewMode: 'perspective' };

// ---------- scene ----------

const viewer = new Viewer(requireElement('viewport'));
const canvas = viewer.renderer.domElement;
const controls = new ViewControls(viewer, canvas);
controls.setMode(ui.viewMode);
controls.fitToRoom(project.room);

let roomGroup = buildRoom(project.room, project.openings, { showCeiling: ui.showCeiling });
viewer.scene.add(roomGroup);

function rebuildRoom(): void {
  const p = store.get();
  viewer.scene.remove(roomGroup);
  disposeObject(roomGroup);
  roomGroup = buildRoom(p.room, p.openings, { showCeiling: ui.showCeiling });
  viewer.scene.add(roomGroup);
}

const furniture = new FurnitureLayer(viewer.scene);

// ---------- panels ----------

const propertiesEl = requireElement('properties');
const panel = mountPropertiesPanel(propertiesEl, {
  getProject: () => store.get(),
  catalog,
  // Exact typed values: grid snapping applies to dragging only.
  onMove: (id, pos) => store.set(moveItem(store.get(), id, pos, 0)),
  onResize: (id, size) => {
    const r = resizeItem(store.get(), id, size);
    if (r.ok) store.set(r.project);
    return r;
  },
  onRecolor: (id, color) => {
    const r = recolorItem(store.get(), id, color);
    if (r.ok) store.set(r.project);
    return r;
  },
  onRotate: (id, delta) => store.set(rotateItem(store.get(), id, delta)),
  onRemove: (id) => store.set(removeItem(store.get(), id)),
});

/** Re-syncs furniture meshes and the properties panel with the project and the selection. */
function refresh(): void {
  const p = store.get();
  // Issues depend on the room and openings too, so they are recomputed on every change.
  const issues = findIssues(p);
  furniture.sync(p.furniture, issues, ui.selectedId);
  panel.render(ui.selectedId, (ui.selectedId !== null && issues.get(ui.selectedId)) || []);
}

/**
 * Applies an edit still being typed in the panel. A click on another item selects it on
 * pointerdown, before the browser blurs the field; without this the re-render would overwrite
 * the typed value and the later `change` would be lost or hit the new selection.
 * Blurring fires `change` synchronously, while the old item is still selected.
 */
function commitPendingEdit(): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && propertiesEl.contains(active)) active.blur();
}

function select(id: string | null): void {
  if (id === ui.selectedId) return;
  commitPendingEdit();
  ui.selectedId = id;
  refresh();
}

/** Import and reset: a whole new project, nothing selected, camera framed on the room. */
function replaceProject(p: Project): void {
  select(null);
  store.set(p);
  controls.fitToRoom(p.room);
}

async function importFile(file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    showErrors(IMPORT_FAILED, [{ path: '', message: `Файл слишком большой (${Math.ceil(file.size / 1024)} КБ)` }]);
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    showErrors(IMPORT_FAILED, [{ path: '', message: `Не удалось прочитать файл: ${e instanceof Error ? e.message : String(e)}` }]);
    return;
  }
  const r = parseProjectFile(text);
  if (!r.ok) {
    // The current project stays as it is.
    showErrors(IMPORT_FAILED, r.errors);
    return;
  }
  replaceProject(r.value);
  showMessage(`Проект «${r.value.name}» загружен`, 'info');
}

mountToolbar(requireElement('toolbar'), {
  catalog,
  ui,
  onViewMode: (m) => {
    ui.viewMode = m;
    controls.setMode(m);
  },
  onCeiling: (on) => {
    ui.showCeiling = on;
    rebuildRoom();
  },
  onGridStep: (mm) => {
    ui.gridStep = mm;
    // The grid is a snapping aid: without snapping it only clutters the floor.
    viewer.setGridVisible(mm > 0);
  },
  onAdd: (catalogId) => {
    const entry = catalog.find((c) => c.id === catalogId);
    if (!entry) return;
    const p = store.get();
    const { project: next, id } = addItem(p, entry, { x: p.room.width / 2, z: p.room.length / 2 });
    // Selected before set(), so the store update renders the new item already selected.
    ui.selectedId = id;
    store.set(next);
  },
  onImport: (file) => void importFile(file),
  onExport: () => downloadProject(store.get()),
  onReset: () => {
    replaceProject(sample);
    showMessage('Восстановлен исходный проект', 'info');
  },
});

refresh();

// ---------- interaction ----------

new DragController(canvas, controls, furniture, {
  onSelect: select,
  // moveItem snaps and returns the same project when nothing changed, so set() is a no-op then.
  onMove: (id, pos) => store.set(moveItem(store.get(), id, pos, ui.gridStep)),
}, viewer.scene);

// ---------- persistence ----------

const autosave = createAutosave(() => saveProject(storage, store.get()), (error) => showMessage(error, 'error'), AUTOSAVE_DELAY_MS);
// A change made right before closing or reloading must not wait for the debounce.
window.addEventListener('pagehide', () => autosave.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave.flush();
});

store.subscribe((p, prev) => {
  // The selected item may be gone (deleted, project imported).
  if (ui.selectedId !== null && !p.furniture.some((f) => f.id === ui.selectedId)) ui.selectedId = null;
  refresh();
  if (p.room !== prev.room || p.openings !== prev.openings) rebuildRoom();
  autosave.schedule();
});

// ---------- keyboard ----------

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea') !== null);
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextInput(e.target)) return;
  if (e.key === 'Escape') {
    select(null);
    return;
  }
  const id = ui.selectedId;
  if (id === null) return;
  // `code`, not `key`: R must work on any keyboard layout (e.g. «К» on the Russian one).
  if (e.code === 'KeyR') {
    e.preventDefault();
    store.set(rotateItem(store.get(), id, e.shiftKey ? -90 : 90));
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    // The subscriber clears the selection once the item is gone.
    store.set(removeItem(store.get(), id));
  }
});
