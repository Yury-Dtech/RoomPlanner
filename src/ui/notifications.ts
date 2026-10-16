import type { ValidationError } from '../data/validate';

export type MessageKind = 'info' | 'warn' | 'error';

/** Info messages fade on their own; warnings and errors stay until closed. */
const INFO_TIMEOUT_MS = 4000;
/** Longer error lists are cut, with a "… и ещё N" line. */
const MAX_LISTED_ERRORS = 20;

let container: HTMLElement | null = null;

/** The stack in the corner of the page, created on first use. */
function stack(): HTMLElement {
  if (container && container.isConnected) return container;
  container = document.createElement('div');
  container.className = 'notifications';
  document.body.append(container);
  return container;
}

function addCard(kind: MessageKind, fill: (card: HTMLElement) => void): void {
  const card = document.createElement('div');
  card.className = `notice notice-${kind}`;
  // Errors and warnings interrupt screen readers; info waits its turn.
  card.setAttribute('role', kind === 'info' ? 'status' : 'alert');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'notice-close';
  close.textContent = '×';
  close.title = 'Закрыть';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => card.remove());

  const body = document.createElement('div');
  body.className = 'notice-body';
  fill(body);

  card.append(body, close);
  stack().append(card);
  if (kind === 'info') setTimeout(() => card.remove(), INFO_TIMEOUT_MS);
}

export function showMessage(text: string, kind: MessageKind): void {
  addCard(kind, (body) => {
    body.textContent = text;
  });
}

/** An error card with a title and one line per validation error (`path: message`). */
export function showErrors(title: string, errors: ValidationError[]): void {
  addCard('error', (body) => {
    const heading = document.createElement('strong');
    heading.textContent = title;
    const list = document.createElement('ul');
    for (const e of errors.slice(0, MAX_LISTED_ERRORS)) {
      const li = document.createElement('li');
      li.textContent = e.path ? `${e.path}: ${e.message}` : e.message;
      list.append(li);
    }
    if (errors.length > MAX_LISTED_ERRORS) {
      const li = document.createElement('li');
      li.textContent = `… и ещё ${errors.length - MAX_LISTED_ERRORS}`;
      list.append(li);
    }
    body.append(heading, list);
  });
}
