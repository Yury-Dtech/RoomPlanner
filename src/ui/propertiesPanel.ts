import type { CatalogEntry, Project, Size3 } from '../data/schema';
import type { Issue } from '../scene/collisions';
import type { OpResult } from '../state/furnitureOps';
import type { Vec2 } from '../utils/units';
import { parseNumberField, setFieldError, toColorInputValue } from './inputs';
import { issueMessage } from './issueText';

export interface PropertiesPanelDeps {
  getProject(): Project;
  catalog: CatalogEntry[];
  onMove(id: string, pos: Vec2): void;
  onResize(id: string, size: Partial<Size3>): OpResult;
  onRecolor(id: string, color: string): OpResult;
  onRotate(id: string, delta: number): void;
  onRemove(id: string): void;
}

export interface PropertiesPanel {
  render(selectedId: string | null, issues: Issue[]): void;
}

type PositionKey = 'x' | 'z';
type SizeKey = keyof Size3;

const POSITION_FIELDS: ReadonlyArray<{ key: PositionKey; label: string }> = [
  { key: 'x', label: 'X' },
  { key: 'z', label: 'Z' },
];
const SIZE_FIELDS: ReadonlyArray<{ key: SizeKey; label: string; title: string }> = [
  { key: 'w', label: 'Ш', title: 'Ширина' },
  { key: 'h', label: 'В', title: 'Высота' },
  { key: 'd', label: 'Г', title: 'Глубина' },
];

/** Dragging without snapping leaves long fractions; the panel shows 0.1 mm. */
function formatNumber(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Text (not `type=number`) so that every keystroke reaches our own parser and error message. */
function numberInput(): HTMLInputElement {
  const input = el('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  return input;
}

function field(label: string, input: HTMLInputElement, title?: string): HTMLLabelElement {
  const l = el('label', 'props-field');
  const caption = el('span', 'props-label', label);
  if (title) caption.title = title;
  l.append(caption, input);
  return l;
}

function button(label: string, onClick: () => void, className?: string): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Properties of the selected item. Edits apply on `change` (Enter or leaving the field), never
 * per keystroke. Invalid input marks the field (`invalid` + error in `title`) and leaves the
 * project unchanged. The DOM is built once; `render` only refills it.
 */
export function mountPropertiesPanel(root: HTMLElement, deps: PropertiesPanelDeps): PropertiesPanel {
  let selectedId: string | null = null;
  const item = () => (selectedId === null ? undefined : deps.getProject().furniture.find((f) => f.id === selectedId));

  root.classList.add('props');
  root.setAttribute('aria-label', 'Свойства предмета');

  const empty = el('p', 'props-empty', 'Выберите предмет кликом');
  const body = el('div', 'props-body');
  const title = el('h2', 'props-title');
  const idLine = el('div', 'props-id');

  // Position: exact typed values; grid snapping is for dragging only.
  const positionInputs = {} as Record<PositionKey, HTMLInputElement>;
  const positionGrid = el('div', 'props-grid');
  for (const { key, label } of POSITION_FIELDS) {
    const input = numberInput();
    input.addEventListener('change', () => {
      const current = item();
      if (!current) return;
      const r = parseNumberField(input.value);
      if (!r.ok) {
        setFieldError(input, r.error);
        return;
      }
      setFieldError(input, null);
      deps.onMove(current.id, { ...current.position, [key]: r.value });
    });
    positionInputs[key] = input;
    positionGrid.append(field(`${label}, мм`, input));
  }

  // Size: the error text comes from the operation (non-numbers are passed as NaN and rejected there).
  const sizeInputs = {} as Record<SizeKey, HTMLInputElement>;
  const sizeGrid = el('div', 'props-grid props-grid-3');
  for (const { key, label, title: hint } of SIZE_FIELDS) {
    const input = numberInput();
    input.addEventListener('change', () => {
      const current = item();
      if (!current) return;
      const parsed = parseNumberField(input.value);
      const r = deps.onResize(current.id, { [key]: parsed.ok ? parsed.value : NaN });
      setFieldError(input, r.ok ? null : r.error);
    });
    sizeInputs[key] = input;
    sizeGrid.append(field(`${label}, мм`, input, hint));
  }

  // Rotation: 90° steps; positive = counter-clockwise seen from above.
  const rotation = el('output', 'props-rotation-value');
  const rotateRow = el('div', 'props-row');
  const ccw = button('⟲ 90°', () => {
    if (selectedId) deps.onRotate(selectedId, 90);
  });
  ccw.title = 'Повернуть против часовой стрелки';
  const cw = button('⟳ 90°', () => {
    if (selectedId) deps.onRotate(selectedId, -90);
  });
  cw.title = 'Повернуть по часовой стрелке';
  rotateRow.append(el('span', 'props-label', 'Поворот'), rotation, ccw, cw);

  const color = el('input');
  color.type = 'color';
  color.addEventListener('change', () => {
    if (!selectedId) return;
    const r = deps.onRecolor(selectedId, color.value);
    setFieldError(color, r.ok ? null : r.error);
  });
  const colorRow = el('label', 'props-row');
  colorRow.append(el('span', 'props-label', 'Цвет'), color);

  const issuesTitle = el('h3', 'props-subtitle', 'Нарушения');
  const issuesList = el('ul', 'props-issues');

  const remove = button(
    'Удалить',
    () => {
      if (selectedId) deps.onRemove(selectedId);
    },
    'props-remove tb-danger',
  );

  body.append(title, idLine, positionGrid, sizeGrid, rotateRow, colorRow, issuesTitle, issuesList, remove);
  root.append(empty, body);

  function render(id: string | null, issues: Issue[]): void {
    selectedId = id;
    const current = item();
    empty.hidden = current !== undefined;
    body.hidden = current === undefined;
    if (!current) return;

    const project = deps.getProject();
    title.textContent = deps.catalog.find((c) => c.id === current.catalogId)?.name ?? current.catalogId;
    idLine.textContent = current.id;

    // Refilling also clears marks left by rejected input: the fields show the real values again.
    for (const { key } of POSITION_FIELDS) {
      positionInputs[key].value = formatNumber(current.position[key]);
      setFieldError(positionInputs[key], null);
    }
    for (const { key } of SIZE_FIELDS) {
      sizeInputs[key].value = formatNumber(current.size[key]);
      setFieldError(sizeInputs[key], null);
    }
    rotation.textContent = `${formatNumber(current.rotationY)}°`;
    color.value = toColorInputValue(current.color);
    setFieldError(color, null);

    issuesList.replaceChildren(
      ...(issues.length === 0
        ? [el('li', 'props-ok', 'Нарушений нет')]
        : issues.map((issue) => el('li', 'props-issue', issueMessage(issue, project, deps.catalog)))),
    );
  }

  render(null, []);
  return { render };
}
