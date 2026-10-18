import { UserRole, BookingStatus, ProductCategory, TabStatus, PaymentMethod } from '@prisma/client';

// ─── Re-export Prisma enums for convenience ───────────────────────────────────
export { UserRole, BookingStatus, ProductCategory, TabStatus, PaymentMethod };

// ─── Serializable DTO types (safe over the wire / JSON) ──────────────────────
// Prisma returns Decimal as string in JSON; DateTime as ISO string.

export type CourtDto = {
  id: string;
  name: string;
  surfaceType: string;
  isActive: boolean;
  hourlyRate: string; // Decimal serialized as string
  openingTime: string; // "HH:MM"
  closingTime: string; // "HH:MM"
  createdAt: string;
};

export type BookingDto = {
  id: string;
  courtId: string;
  courtName?: string;
  leadBookerId: string;
  leadBookerName?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: BookingStatus;
  totalAmount: string;
  paymentConfirmedBy?: string | null;
  paymentConfirmedAt?: string | null;
  isWalkIn?: boolean;
  walkInGuestName?: string | null;
  walkInGuestPhone?: string | null;
  walkInGuestEmail?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type UserDto = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  createdAt: string;
};

// ─── API Response wrappers ─────────────────────────────────────────────────────

export type ApiSuccess<T> = { data: T; error: null };
export type ApiError = { data: null; error: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { data, error: null };
}

export function apiError(message: string): ApiError {
  return { data: null, error: message };
}
