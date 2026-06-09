const DURATION_PATTERN = /^(\d+)([smhd])$/u;
export type DurationString = `${number}${'s' | 'm' | 'h' | 'd'}`;

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const unitMultipliers: Record<string, number> = {
  s: MILLISECONDS_PER_SECOND,
  m: MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE,
  h: MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR,
  d: MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY,
};

export function parseDurationToMilliseconds(duration: string): number {
  const match = DURATION_PATTERN.exec(duration);

  if (!match) {
    throw new Error('Duration must use a supported unit: s, m, h, or d.');
  }

  const amountValue = match[1];
  const unit = match[2] as 's' | 'm' | 'h' | 'd' | undefined;

  if (!amountValue || !unit) {
    throw new Error('Duration must include an amount and a supported unit.');
  }

  const amount = Number(amountValue);
  const multiplier = unitMultipliers[unit];

  if (!Number.isSafeInteger(amount) || amount <= 0 || multiplier === undefined) {
    throw new Error('Duration must be a positive safe integer.');
  }

  return amount * multiplier;
}

export function toDurationString(duration: string): DurationString {
  parseDurationToMilliseconds(duration);

  return duration as DurationString;
}
