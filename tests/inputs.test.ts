import { describe, expect, test } from 'vitest';
import { parseGridStep, parseNumberField, toColorInputValue } from '../src/ui/inputs';

describe('parseNumberField', () => {
  test('parses integers, decimals and a decimal comma', () => {
    expect(parseNumberField('1200')).toEqual({ ok: true, value: 1200 });
    expect(parseNumberField(' 12.5 ')).toEqual({ ok: true, value: 12.5 });
    expect(parseNumberField('12,5')).toEqual({ ok: true, value: 12.5 });
    expect(parseNumberField('-5')).toEqual({ ok: true, value: -5 });
    expect(parseNumberField('0')).toEqual({ ok: true, value: 0 });
  });

  test('empty and blank input is an error, not zero', () => {
    expect(parseNumberField('')).toEqual({ ok: false, error: 'Введите число' });
    expect(parseNumberField('   ')).toEqual({ ok: false, error: 'Введите число' });
  });

  test('non-numeric and non-finite input is an error', () => {
    for (const text of ['abc', '12abc', 'Infinity', '-Infinity', 'NaN', '1e400', '0x10', '1,2,3']) {
      expect(parseNumberField(text), text).toEqual({ ok: false, error: 'Введите число' });
    }
  });
});

describe('parseGridStep', () => {
  test('accepts zero (no snapping) and positive values', () => {
    expect(parseGridStep('0')).toEqual({ ok: true, value: 0 });
    expect(parseGridStep('50')).toEqual({ ok: true, value: 50 });
    expect(parseGridStep('12.5')).toEqual({ ok: true, value: 12.5 });
  });

  test('rejects empty, non-finite and negative values', () => {
    expect(parseGridStep('')).toEqual({ ok: false, error: 'Введите число' });
    expect(parseGridStep('Infinity')).toEqual({ ok: false, error: 'Введите число' });
    expect(parseGridStep('-10')).toEqual({ ok: false, error: 'Шаг не может быть отрицательным' });
  });

  test('normalizes -0 to 0', () => {
    const r = parseGridStep('-0');
    expect(r.ok && Object.is(r.value, 0)).toBe(true);
  });
});

describe('toColorInputValue', () => {
  test('keeps #rrggbb, lower-cased', () => {
    expect(toColorInputValue('#8B6B4A')).toBe('#8b6b4a');
  });

  test('expands #rgb to #rrggbb', () => {
    expect(toColorInputValue('#fA0')).toBe('#ffaa00');
  });

  test('anything else falls back to black (the color input default)', () => {
    expect(toColorInputValue('red')).toBe('#000000');
    expect(toColorInputValue('')).toBe('#000000');
  });
});
