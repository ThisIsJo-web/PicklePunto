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
  RESERVED: 'Open',
  BOOKED: 'Fully Booked',
  BLOCKED: 'Blocked',
  CLOSED: 'Closed',
};

/** Normalise any backend status string to a visual state. 
 *  Per system requirements: 3 main statuses: Open (AVAILABLE), Fully Booked (BOOKED), Playing (USING), plus Blocked.
 *  Pending/Awaiting Payment records do not mark court as playing or held.
 */
export function toVisualState(s: string | undefined | null): CourtVisualState {
  switch ((s || '').toUpperCase()) {
    case 'USING':
    case 'PLAYING':
    case 'IN_USE':
    case 'IN_PROGRESS':
      return 'USING';
    case 'BOOKED':
    case 'FULLY_BOOKED':
      return 'BOOKED';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'CLOSED':
      return 'CLOSED';
    case 'AVAILABLE':
    case 'OPEN':
    case 'RESERVED':
    case 'AWAITING_PAYMENT':
    case 'PENDING':
    default:
      return 'AVAILABLE';
  }
}
