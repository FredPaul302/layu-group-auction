export type DeadlineTone = 'default' | 'warning' | 'danger' | 'muted';

export interface FormatRelativeDeadlineOptions {
  now?: Date | number;
  completedLabel?: string;
  warningMinutes?: number;
  urgentMinutes?: number;
}

export interface RelativeDeadlineResult {
  label: string;
  tone: DeadlineTone;
  expired: boolean;
  msRemaining: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toTimestamp(value: Date | string | number): number {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

export function formatAbsoluteDateTime(
  value: Date | string | number,
  locale = 'en-US',
): string {
  const ts = toTimestamp(value);

  if (Number.isNaN(ts)) {
    return 'Time unavailable';
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function formatRelativeDeadline(
  value: Date | string | number,
  options: FormatRelativeDeadlineOptions = {},
): RelativeDeadlineResult {
  const {
    now = Date.now(),
    completedLabel = 'Ended',
    warningMinutes = 6 * 60,
    urgentMinutes = 60,
  } = options;

  const targetTs = toTimestamp(value);
  const nowTs = now instanceof Date ? now.getTime() : now;

  if (Number.isNaN(targetTs)) {
    return {
      label: 'Time unavailable',
      tone: 'muted',
      expired: false,
      msRemaining: 0,
    };
  }

  const msRemaining = targetTs - nowTs;

  if (msRemaining <= 0) {
    return {
      label: completedLabel,
      tone: 'muted',
      expired: true,
      msRemaining,
    };
  }

  const totalMinutes = Math.ceil(msRemaining / MINUTE);
  const totalHours = Math.floor(msRemaining / HOUR);
  const minutesRemainder = Math.floor((msRemaining % HOUR) / MINUTE);
  const totalDays = Math.floor(msRemaining / DAY);
  const hoursRemainder = Math.floor((msRemaining % DAY) / HOUR);

  let label: string;

  if (msRemaining < MINUTE) {
    label = '<1m left';
  } else if (msRemaining < HOUR) {
    label = `${totalMinutes}m left`;
  } else if (msRemaining < DAY) {
    label =
      minutesRemainder > 0
        ? `${totalHours}h ${minutesRemainder}m left`
        : `${totalHours}h left`;
  } else {
    label =
      hoursRemainder > 0
        ? `${totalDays}d ${hoursRemainder}h left`
        : `${totalDays}d left`;
  }

  const tone: DeadlineTone =
    totalMinutes <= urgentMinutes
      ? 'danger'
      : totalMinutes <= warningMinutes
        ? 'warning'
        : 'default';

  return {
    label,
    tone,
    expired: false,
    msRemaining,
  };
}