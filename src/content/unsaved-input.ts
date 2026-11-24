/**
 * Heuristic "unsaved work" detection: remembers text fields/contenteditables the
 * user typed into that still hold text and weren't submitted. Tablin won't close
 * a tab while this reports true. Search boxes are ignored (a half-typed search
 * isn't work you'd lose).
 */

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'url', 'tel', 'number', 'password', '']);

function isSearchLike(el: Element): boolean {
  const role = el.getAttribute('role');
  const name = (el.getAttribute('name') ?? '').toLowerCase();
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  return (
    type === 'search' ||
    role === 'searchbox' ||
    role === 'combobox' ||
    name === 'q' ||
    name === 'search' ||
    name === 'search_query' ||
    el.closest('form[role="search"], [role="search"]') !== null
  );
}

export function isTrackedEditable(el: unknown): el is HTMLElement {
  if (!(el instanceof Element)) return false;
  if (isSearchLike(el)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(el.type.toLowerCase()) && !el.readOnly && !el.disabled;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function currentText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? '';
}

export class UnsavedInputTracker {
  private readonly dirty = new Set<HTMLElement>();

  constructor(private readonly doc: Document) {
    doc.addEventListener('input', this.onInput, true);
    doc.addEventListener('submit', this.onSubmit, true);
  }

  private onInput = (event: Event): void => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    let target: unknown = path[0] ?? event.target;
    // Typing inside a contenteditable fires on the editing host or a child node.
    if (target instanceof Element && !isTrackedEditable(target)) {
      const host = target.closest('[contenteditable=""], [contenteditable="true"]');
      if (host) target = host;
    }
    if (isTrackedEditable(target)) this.dirty.add(target);
  };

  private onSubmit = (event: Event): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    for (const el of this.dirty) if (form.contains(el)) this.dirty.delete(el);
  };

  hasUnsavedInput(): boolean {
    for (const el of [...this.dirty]) {
      if (!el.isConnected) {
        this.dirty.delete(el);
        continue;
      }
      if (currentText(el).trim().length > 0) return true;
      this.dirty.delete(el);
    }
    return false;
  }

  destroy(): void {
    this.doc.removeEventListener('input', this.onInput, true);
    this.doc.removeEventListener('submit', this.onSubmit, true);
    this.dirty.clear();
  }
}
