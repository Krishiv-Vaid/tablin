// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { UnsavedInputTracker } from '../../src/content/unsaved-input';

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('unsaved input detection', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('flags typed text in a textarea', () => {
    const t = new UnsavedInputTracker(document);
    const area = document.createElement('textarea');
    document.body.append(area);
    expect(t.hasUnsavedInput()).toBe(false);
    type(area, 'my half-written comment');
    expect(t.hasUnsavedInput()).toBe(true);
    t.destroy();
  });

  it('clears when the text is deleted, the field removed, or the form submitted', () => {
    const t = new UnsavedInputTracker(document);
    const form = document.createElement('form');
    const input = document.createElement('input');
    form.append(input);
    document.body.append(form);
    type(input, 'hello');
    type(input, '   ');
    expect(t.hasUnsavedInput()).toBe(false);
    type(input, 'hello');
    form.dispatchEvent(new Event('submit', { bubbles: true }));
    expect(t.hasUnsavedInput()).toBe(false);
    type(input, 'again');
    form.remove();
    expect(t.hasUnsavedInput()).toBe(false);
    t.destroy();
  });

  it('ignores search boxes and read-only fields', () => {
    const t = new UnsavedInputTracker(document);
    const search = document.createElement('input');
    search.type = 'search';
    const q = document.createElement('input');
    q.name = 'search_query';
    const ro = document.createElement('input');
    ro.readOnly = true;
    document.body.append(search, q, ro);
    type(search, 'cats');
    type(q, 'cats');
    type(ro, 'x');
    expect(t.hasUnsavedInput()).toBe(false);
    t.destroy();
  });

  it('tracks contenteditable editors', () => {
    const t = new UnsavedInputTracker(document);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const p = document.createElement('p');
    editor.append(p);
    document.body.append(editor);
    p.textContent = 'draft post';
    p.dispatchEvent(new Event('input', { bubbles: true }));
    // jsdom has no isContentEditable; emulate the browser behavior.
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    p.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.hasUnsavedInput()).toBe(true);
    t.destroy();
  });
});
