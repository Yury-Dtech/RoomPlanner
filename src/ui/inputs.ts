// Parsing of text typed into UI fields (pure) and marking a field as invalid.

export type FieldResult = { ok: true; value: number } | { ok: false; error: string };

const NOT_A_NUMBER = 'Введите число';
/** Plain decimal notation only: no hex, no `Infinity`, no thousands separators. */
const DECIMAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Parses a numeric field. Empty input is an error (not 0); a decimal comma is accepted.
 * Never returns a non-finite value.
 */
export function parseNumberField(text: string): FieldResult {
  const s = text.trim().replace(',', '.');
  if (!DECIMAL_RE.test(s)) return { ok: false, error: NOT_A_NUMBER };
  const value = Number(s);
  if (!Number.isFinite(value)) return { ok: false, error: NOT_A_NUMBER };
  return { ok: true, value };
}

/** Smallest and largest non-zero grid step, mm. */
export const MIN_GRID_STEP = 1;
export const MAX_GRID_STEP = 10000;

/**
 * Grid step in mm: 0 turns snapping off, otherwise MIN_GRID_STEP…MAX_GRID_STEP. A tiny step
 * (e.g. 1e-320) would make snapping overflow to Infinity.
 */
export function parseGridStep(text: string): FieldResult {
  const r = parseNumberField(text);
  if (!r.ok) return r;
  if (r.value < 0) return { ok: false, error: 'Шаг не может быть отрицательным' };
  if (r.value !== 0 && (r.value < MIN_GRID_STEP || r.value > MAX_GRID_STEP)) {
    return { ok: false, error: `Шаг: 0 (без привязки) или от ${MIN_GRID_STEP} до ${MAX_GRID_STEP} мм` };
  }
  return { ok: true, value: r.value + 0 };
}

/** `<input type="color">` only accepts `#rrggbb`; the project also allows `#rgb`. */
export function toColorInputValue(color: string): string {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return '#000000';
}

/** Marks an input as invalid (red, error in the tooltip) or clears the mark. */
export function setFieldError(input: HTMLInputElement, error: string | null): void {
  input.classList.toggle('invalid', error !== null);
  input.title = error ?? '';
  input.setAttribute('aria-invalid', String(error !== null));
}
