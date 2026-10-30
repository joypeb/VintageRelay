import { z } from 'zod';

import { DISPLAY_NAME_MAX } from '@/lib/validation/event';

export type JoinField = 'entryCode' | 'displayName';
export type JoinFieldErrors = Partial<Record<JoinField, string>>;

const FORM_ERROR_MESSAGE = 'Something went wrong. Please try again.';
const ENTRY_CODE_REQUIRED = 'Enter the entry code.';
const DISPLAY_NAME_LENGTH = `Enter a display name of 1–${DISPLAY_NAME_MAX} characters.`;
const DISPLAY_NAME_CHARACTERS = 'Remove line breaks and tabs.';

type JoinValidation = { ok: true; value: string } | { ok: false; message: string };

/** Server 422 reasons per field, worded identically to the device-side checks. */
const SERVER_REASON_MESSAGES: Record<JoinField, Record<string, string>> = {
  entryCode: { required: ENTRY_CODE_REQUIRED, invalid_type: ENTRY_CODE_REQUIRED },
  displayName: {
    required: DISPLAY_NAME_LENGTH,
    invalid_type: DISPLAY_NAME_LENGTH,
    too_long: DISPLAY_NAME_LENGTH,
    invalid_characters: DISPLAY_NAME_CHARACTERS,
  },
};

export function readInitialCode(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

export function validateEntryCode(raw: string): JoinValidation {
  const value = raw.trim();
  return value === '' ? { ok: false, message: ENTRY_CODE_REQUIRED } : { ok: true, value };
}

export function validateDisplayName(raw: string): JoinValidation {
  const value = raw.trim();
  const length = [...value].length;
  if (length < 1 || length > DISPLAY_NAME_MAX) return { ok: false, message: DISPLAY_NAME_LENGTH };
  if (/\p{Cc}/u.test(value)) return { ok: false, message: DISPLAY_NAME_CHARACTERS };
  return { ok: true, value };
}

const serverDetailsSchema = z.object({
  fields: z.array(z.object({ field: z.string(), reason: z.string() })).min(1),
});

function isJoinField(field: string): field is JoinField {
  return Object.hasOwn(SERVER_REASON_MESSAGES, field);
}

function lookupFieldError(
  field: string,
  reason: string,
): { field: JoinField; message: string } | undefined {
  if (!isJoinField(field)) return undefined;
  const reasons = SERVER_REASON_MESSAGES[field];
  const message = Object.hasOwn(reasons, reason) ? reasons[reason] : undefined;
  return message === undefined ? undefined : { field, message };
}

export function mapJoinServerFieldErrors(details: unknown): {
  fieldErrors: JoinFieldErrors;
  formError: string | null;
} {
  const parsed = serverDetailsSchema.safeParse(details);
  if (!parsed.success) return { fieldErrors: {}, formError: FORM_ERROR_MESSAGE };

  const fieldErrors: JoinFieldErrors = {};
  let formError: string | null = null;
  for (const { field, reason } of parsed.data.fields) {
    const entry = lookupFieldError(field, reason);
    if (entry === undefined) {
      formError = FORM_ERROR_MESSAGE;
    } else {
      fieldErrors[entry.field] ??= entry.message;
    }
  }
  return { fieldErrors, formError };
}
