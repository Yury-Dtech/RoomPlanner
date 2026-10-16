import type { CatalogEntry } from '../data/schema';
import type { ViewMode } from '../scene/controls';
import { parseGridStep, setFieldError } from './inputs';

/** UI-only state; lives in main.ts and is never saved with the project. */
export interface UiState {
  selectedId: string | null;
  /** Drag snapping step, mm; 0 = no snapping. */
  gridStep: number;
  showCeiling: boolean;
  viewMode: ViewMode;
}

export interface ToolbarDeps {
  catalog: CatalogEntry[];
  ui: UiState;
  onViewMode(m: ViewMode): void;
  onCeiling(on: boolean): void;
  onGridStep(mm: number): void;
  onAdd(catalogId: string): void;
  onImport(file: File): void;
  onExport(): void;
  onReset(): void;
}

const VIEW_MODES: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: 'perspective', label: 'Перспектива' },
  { mode: 'top', label: 'Сверху' },
];

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function group(className: string, ...children: HTMLElement[]): HTMLDivElement {
  const g = document.createElement('div');
  g.className = `tb-group ${className}`;
  g.append(...children);
  return g;
}

export function mountToolbar(el: HTMLElement, deps: ToolbarDeps): void {
  const { ui } = deps;
  el.classList.add('toolbar');

  // View mode: two toggle buttons.
  const viewButtons = VIEW_MODES.map(({ mode, label }) => {
    const b = button(label, () => {
      if (ui.viewMode === mode) return;
      deps.onViewMode(mode);
      syncViewButtons();
    });
    b.dataset.mode = mode;
    return b;
  });
  const syncViewButtons = (): void => {
    for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === ui.viewMode));
  };
  syncViewButtons();
  const viewGroup = group('tb-view', ...viewButtons);
  viewGroup.setAttribute('role', 'group');
  viewGroup.setAttribute('aria-label', 'Вид');

  // Ceiling.
  const ceiling = document.createElement('input');
  ceiling.type = 'checkbox';
  ceiling.checked = ui.showCeiling;
  ceiling.addEventListener('change', () => deps.onCeiling(ceiling.checked));
  const ceilingLabel = document.createElement('label');
  ceilingLabel.className = 'tb-check';
  ceilingLabel.append(ceiling, ' Потолок');

  // Grid step: applied on change; a bad value keeps the previous step.
  const step = document.createElement('input');
  step.type = 'number';
  step.min = '0';
  step.step = '10';
  step.value = String(ui.gridStep);
  step.className = 'tb-step';
  step.addEventListener('change', () => {
    const r = parseGridStep(step.value);
    if (!r.ok) {
      setFieldError(step, r.error);
      return;
    }
    setFieldError(step, null);
    step.value = String(r.value);
    deps.onGridStep(r.value);
  });
  const stepLabel = document.createElement('label');
  stepLabel.append('Шаг сетки, мм ', step);

  // Catalog: entries grouped by category.
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Каталог мебели');
  const byCategory = new Map<string, HTMLOptGroupElement>();
  for (const entry of deps.catalog) {
    const category = entry.category || 'Прочее';
    let og = byCategory.get(category);
    if (!og) {
      og = document.createElement('optgroup');
      og.label = category;
      byCategory.set(category, og);
      select.append(og);
    }
    og.append(new Option(entry.name, entry.id));
  }
  const add = button('Добавить', () => {
    if (select.value) deps.onAdd(select.value);
  });
  if (deps.catalog.length === 0) {
    select.disabled = true;
    add.disabled = true;
    select.append(new Option('Каталог пуст', ''));
  }

  // Import / export / reset.
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    // Clear it so choosing the same file again still fires `change`.
    file.value = '';
    if (f) deps.onImport(f);
  });
  const importBtn = button('Импорт', () => file.click());
  const exportBtn = button('Экспорт', () => deps.onExport());
  const resetBtn = button('Сбросить к исходному', () => {
    if (confirm('Сбросить проект к исходному? Текущие изменения будут потеряны.')) deps.onReset();
  });
  resetBtn.className = 'tb-danger';

  el.append(
    viewGroup,
    group('tb-options', ceilingLabel, stepLabel),
    group('tb-catalog', select, add),
    group('tb-file', importBtn, exportBtn, resetBtn, file),
  );
}
