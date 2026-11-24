import { useEffect, useState } from 'react';
import { MAX_NAME_LENGTH } from '../../shared/constants';

/**
 * Keeps a local draft so typing spaces or clearing the field isn't fought by
 * validation; saves the trimmed name when it's non-empty.
 */
export function NameInput(props: { value: string; onSave(name: string): void; label: string }) {
  const [draft, setDraft] = useState(props.value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(props.value);
  }, [props.value, focused]);

  return (
    <input
      className="text-input"
      value={draft}
      maxLength={MAX_NAME_LENGTH}
      aria-label={props.label}
      aria-invalid={draft.trim() === '' ? true : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(props.value);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim()) props.onSave(e.target.value.trim());
      }}
    />
  );
}
