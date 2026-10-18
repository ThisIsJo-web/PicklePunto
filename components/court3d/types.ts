export type CourtVisualState =
  | 'AVAILABLE'
  | 'USING'
  | 'RESERVED'
  | 'BOOKED'
  | 'BLOCKED'
  | 'CLOSED';

export interface StageCourt {
  id: string;
  name: string;
  state: CourtVisualState;
  /** Optional small caption shown under the name in the chips (e.g. "₱350/hr") */
  caption?: string;
}

export const STATE_LABEL: Record<CourtVisualState, string> = {
  AVAILABLE: 'Open',
  USING: 'Playing',
  RESERVED: 'Held',
  BOOKED: 'Booked',
  BLOCKED: 'Blocked',
  CLOSED: 'Closed',
};

/** Normalise any backend status string to a visual state. */
export function toVisualState(s: string | undefined | null): CourtVisualState {
  switch ((s || '').toUpperCase()) {
    case 'USING':
    case 'IN_USE':
    case 'IN_PROGRESS':
      return 'USING';
    case 'RESERVED':
    case 'AWAITING_PAYMENT':
    case 'PENDING':
      return 'RESERVED';
    case 'BOOKED':
    case 'CONFIRMED':
      return 'BOOKED';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'AVAILABLE';
  }
}
