'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import {
  ScopePicker,
  type BundlePreset,
  type ScopePickerState,
} from './ScopePicker';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

/**
 * Modal wrapper around <ScopePicker>. The pair / edit forms stay
 * compact: a single trigger row with a summary of how many scopes are
 * selected (and how many parameter errors block submit). Clicking
 * "Edit scopes" opens a fullscreen overlay with the full picker.
 *
 * Selection state lives in this component (so the pair form sees the
 * latest committed picker state through `onChange`) and is also
 * surfaced via `onChange` for the parent's submit-time validation.
 */
export function ScopePickerModal({
  catalog,
  bundles,
  initialSelected = [],
  initialParams = {},
  onChange,
}: {
  catalog: ScopeTemplate[];
  bundles: BundlePreset[];
  initialSelected?: string[];
  initialParams?: Record<string, Record<string, unknown>>;
  onChange: (state: ScopePickerState) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<ScopePickerState>({
    selectedIds: initialSelected,
    paramsMap: initialParams,
    valid: initialSelected.length > 0,
    errors: {},
  });

  // Lock body scroll while the modal is open so the user doesn't lose
  // their place on the underlying form when the picker is tall.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function handlePickerChange(s: ScopePickerState): void {
    setPicker(s);
    onChange(s);
  }

  const errorCount = Object.keys(picker.errors).length;
  const summaryTone =
    picker.selectedIds.length === 0
      ? 'yellow'
      : errorCount > 0
        ? 'red'
        : 'paper';

  return (
    <>
      <div className="border border-rule bg-paper-2 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-kicker uppercase text-muted">
            SCOPES
          </span>
          <Badge tone={summaryTone} className="text-[9px] px-2 py-0.5">
            {picker.selectedIds.length} SELECTED
            {errorCount > 0 ? ` · ${errorCount} ERR` : ''}
          </Badge>
          {picker.selectedIds.length > 0 && (
            <span className="text-body-sm text-ink-2 break-all max-w-[60ch]">
              {picker.selectedIds.slice(0, 4).join(', ')}
              {picker.selectedIds.length > 4 ? ` +${picker.selectedIds.length - 4}` : ''}
            </span>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          arrow
          onClick={() => setOpen(true)}
        >
          {picker.selectedIds.length === 0 ? 'Pick scopes' : 'Edit scopes'}
        </Button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-stretch justify-center p-4 md:p-8"
          onClick={(e) => {
            // backdrop click closes
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-paper border border-rule shadow-2xl w-full max-w-4xl flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <header className="flex items-baseline justify-between px-6 py-4 border-b border-rule">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-kicker uppercase text-muted">
                  // SCOPE PICKER
                </span>
                <h2 className="font-display font-medium text-h4 m-0">
                  What can the peer do?
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-kicker uppercase text-muted hover:text-ink"
                aria-label="Close scope picker"
              >
                CLOSE ✕
              </button>
            </header>
            <div className="flex-1 overflow-auto px-6 py-5">
              <ScopePicker
                catalog={catalog}
                bundles={bundles}
                initialSelected={initialSelected}
                initialParams={initialParams}
                onChange={handlePickerChange}
              />
            </div>
            <footer className="flex items-center justify-between px-6 py-4 border-t border-rule bg-paper-2">
              <span className="font-mono text-kicker uppercase text-muted">
                {picker.selectedIds.length} SELECTED
                {errorCount > 0 ? ` · ${errorCount} PARAMETER ERRORS` : ''}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
