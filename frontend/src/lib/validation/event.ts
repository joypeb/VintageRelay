import type { CreateEventRequest } from '@/types/event';

export function toCreateEventRequest(values: {
  name: string;
  organizerDisplayName: string;
}): CreateEventRequest {
  return {
    name: values.name.trim(),
    organizerDisplayName: values.organizerDisplayName.trim(),
  };
}
