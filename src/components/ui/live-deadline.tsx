'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  formatAbsoluteDateTime,
  formatRelativeDeadline,
} from '@/lib/ui/format-relative-deadline';

type LiveDeadlineProps = {
  at: Date | string | number | null | undefined;
  prefix?: string;
  completedLabel?: string;
  className?: string;
  showAbsolute?: boolean;
  warningMinutes?: number;
  urgentMinutes?: number;
};

const toneClasses = {
  default: 'live-deadline-pill live-deadline-default',
  warning: 'live-deadline-pill live-deadline-warning',
  danger: 'live-deadline-pill live-deadline-danger',
  muted: 'live-deadline-pill live-deadline-muted',
} as const;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const fallbackDeadline = {
  label: '—',
  tone: 'muted' as const,
  expired: false,
  msRemaining: 0,
};

const deadlineListeners = new Set<() => void>();
let deadlineTickerId: number | null = null;
let currentNowMs = 0;

function emitNow() {
  currentNowMs = Date.now();

  for (const listener of deadlineListeners) {
    listener();
  }
}

function subscribeToNow(listener: () => void) {
  deadlineListeners.add(listener);

  if (deadlineListeners.size === 1 && typeof window !== 'undefined') {
    emitNow();
    deadlineTickerId = window.setInterval(emitNow, 15_000);
  }

  return () => {
    deadlineListeners.delete(listener);

    if (deadlineListeners.size === 0 && deadlineTickerId != null && typeof window !== 'undefined') {
      window.clearInterval(deadlineTickerId);
      deadlineTickerId = null;
    }
  };
}

function getClientNowSnapshot() {
  return currentNowMs;
}

function getServerNowSnapshot() {
  return 0;
}

export function LiveDeadline({
  at,
  prefix,
  completedLabel = 'Ended',
  className,
  showAbsolute = false,
  warningMinutes,
  urgentMinutes,
}: LiveDeadlineProps) {
  const now = useSyncExternalStore(subscribeToNow, getClientNowSnapshot, getServerNowSnapshot);

  const iso = useMemo(() => {
    if (!at) {
      return null;
    }

    const date = at instanceof Date ? at : new Date(at);
    const ts = date.getTime();

    if (Number.isNaN(ts)) {
      return null;
    }

    return date.toISOString();
  }, [at]);

  if (!at || !iso) {
    return null;
  }

  const hasNowSnapshot = now > 0;
  const deadline = hasNowSnapshot
    ? formatRelativeDeadline(at, {
        now,
        completedLabel,
        warningMinutes,
        urgentMinutes,
      })
    : fallbackDeadline;

  const absoluteLabel = hasNowSnapshot ? formatAbsoluteDateTime(at) : null;

  return (
    <div className={cx('live-deadline', className)}>
      <div
        className={cx(
          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1',
          toneClasses[deadline.tone],
        )}
      >
        {prefix ? <span className="live-deadline-prefix">{prefix}</span> : null}
        <time dateTime={iso}>{deadline.label}</time>
      </div>

      {showAbsolute && absoluteLabel ? (
        <p className="live-deadline-absolute mt-1 text-xs">{absoluteLabel}</p>
      ) : null}
    </div>
  );
}
