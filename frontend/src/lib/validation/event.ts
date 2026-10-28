import { z } from 'zod';

import type { CreateEventRequest } from '@/types/event';

export const EVENT_NAME_MAX = 60;
export const DISPLAY_NAME_MAX = 30;

export type CreateEventField = 'name' | 'organizerDisplayName';
export type CreateEventFieldErrors = Partial<Record<CreateEventField, string>>;

const FORM_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Shared by device-side checks and server 422 reasons so both show identical wording. */
type FieldReason = 'required' | 'too_long' | 'invalid_characters' | 'invalid_type';

export const FIELD_ERROR_MESSAGES: Record<CreateEventField, Record<FieldReason, string>> = {
  name: {
    required: 'Please enter an event name.',
    too_long: `Use at most ${EVENT_NAME_MAX} characters.`,
    invalid_characters: 'Remove line breaks and tabs.',
    invalid_type: 'Please enter text.',
  },
  organizerDisplayName: {
    required: 'Please enter your display name.',
    too_long: `Use at most ${DISPLAY_NAME_MAX} characters.`,
    invalid_characters: 'Remove line breaks and tabs.',
    invalid_type: 'Please enter text.',
  },
};

function isFieldReason(reason: string): reason is FieldReason {
  return Object.hasOwn(FIELD_ERROR_MESSAGES.name, reason);
}

function messageFor(field: CreateEventField, reason: string): string | undefined {
  return isFieldReason(reason) ? FIELD_ERROR_MESSAGES[field][reason] : undefined;
}

function fieldSchema(field: CreateEventField, max: number) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const messages = FIELD_ERROR_MESSAGES[field];
      let message: string | null = null;
      if (value === '') message = messages.required;
      else if ([...value].length > max) message = messages.too_long;
      else if (/\p{Cc}/u.test(value)) message = messages.invalid_characters;
      if (message !== null) ctx.addIssue({ code: 'custom', message });
    });
}

const createEventFormSchema = z.object({
  name: fieldSchema('name', EVENT_NAME_MAX),
  organizerDisplayName: fieldSchema('organizerDisplayName', DISPLAY_NAME_MAX),
});

export function toCreateEventRequest(values: {
  name: string;
  organizerDisplayName: string;
}): CreateEventRequest {
  return {
    name: values.name.trim(),
    organizerDisplayName: values.organizerDisplayName.trim(),
  };
}

export type CreateEventFormResult =
  { ok: true; value: CreateEventRequest } | { ok: false; errors: CreateEventFieldErrors };

export function validateCreateEventForm(values: {
  name: string;
  organizerDisplayName: string;
}): CreateEventFormResult {
  const result = createEventFormSchema.safeParse(values);
  if (result.success) return { ok: true, value: result.data };

  const errors: CreateEventFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if ((field === 'name' || field === 'organizerDisplayName') && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return { ok: false, errors };
}

const serverDetailsSchema = z.object({
  fields: z.array(z.object({ field: z.string(), reason: z.string() })),
});

export function mapServerFieldErrors(details: unknown): {
  fieldErrors: CreateEventFieldErrors;
  formError: string | null;
} {
  const parsed = serverDetailsSchema.safeParse(details);
  if (!parsed.success) return { fieldErrors: {}, formError: FORM_ERROR_MESSAGE };

  const fieldErrors: CreateEventFieldErrors = {};
  let formError: string | null = null;
  for (const { field, reason } of parsed.data.fields) {
    const message =
      field === 'name' || field === 'organizerDisplayName' ? messageFor(field, reason) : undefined;
    if (message === undefined) {
      formError = FORM_ERROR_MESSAGE;
    } else if (field === 'name' || field === 'organizerDisplayName') {
      fieldErrors[field] ??= message;
    }
  }
  return { fieldErrors, formError };
}
