export type ClothingCategoryValue = 'top' | 'outer' | 'bottom' | 'other' | '';

export type MeasurementField =
  | 'totalLength'
  | 'chest'
  | 'shoulder'
  | 'sleeve'
  | 'waist'
  | 'hem'
  | 'inseam'
  | 'thigh';

export type MeasurementsInput = Partial<Record<MeasurementField, string>>;

export type ClothingDraft = {
  title: string;
  description: string;
  category: ClothingCategoryValue;
  measurements: MeasurementsInput;
};

export type ClothingField =
  | 'title'
  | 'description'
  | 'category'
  | MeasurementField
  | 'form';

export type ClothingFieldErrors = Partial<Record<ClothingField, string>>;

export type RegisterClothingBody = {
  photoIds: string[];
  category: Exclude<ClothingCategoryValue, ''>;
  title: string;
  description: string;
  measurements?: Partial<Record<MeasurementField, number>>;
};

const TOP_FIELDS: MeasurementField[] = ['totalLength', 'chest', 'shoulder', 'sleeve'];
const BOTTOM_FIELDS: MeasurementField[] = ['totalLength', 'waist', 'hem', 'inseam', 'thigh'];

const MEASUREMENT_PATTERN = /^\d{1,3}(\.\d)?$/;

/** Counts Unicode code points, the same way the server counts characters. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isValidMeasurement(raw: string): boolean {
  const value = raw.trim();
  if (value === '') return true;
  if (!MEASUREMENT_PATTERN.test(value)) return false;
  const numeric = Number(value);
  return numeric > 0 && numeric <= 120;
}

export function validateClothingDraft(draft: ClothingDraft): ClothingFieldErrors {
  const errors: ClothingFieldErrors = {};
  const title = draft.title.trim();
  if (title === '') {
    errors.title = 'Enter a title.';
  } else if (codePointLength(title) > 100) {
    errors.title = 'Use 100 characters or fewer.';
  } else if (/\p{Cc}/u.test(title)) {
    errors.title = 'Use a single line without special characters.';
  }
  const description = draft.description.trim();
  if (description === '') {
    errors.description = 'Enter a description.';
  } else if (codePointLength(description) > 1000) {
    errors.description = 'Use 1,000 characters or fewer.';
  }
  if (draft.category === '') {
    errors.category = 'Choose a category.';
  }
  for (const [field, raw] of Object.entries(draft.measurements)) {
    if (raw === undefined) continue;
    if (!isValidMeasurement(raw)) {
      errors[field as MeasurementField] ??= 'Enter a number from 0.1 to 120.';
    }
  }
  return errors;
}

export function measurementFieldsFor(category: ClothingCategoryValue): MeasurementField[] {
  if (category === 'top' || category === 'outer') return [...TOP_FIELDS];
  if (category === 'bottom') return [...BOTTOM_FIELDS];
  return [];
}

export function pruneMeasurements(
  category: ClothingCategoryValue,
  measurements: MeasurementsInput,
): MeasurementsInput {
  const allowed = new Set<MeasurementField>(measurementFieldsFor(category));
  const pruned: MeasurementsInput = {};
  for (const [field, value] of Object.entries(measurements)) {
    if (value !== undefined && allowed.has(field as MeasurementField)) {
      pruned[field as MeasurementField] = value;
    }
  }
  return pruned;
}

export function buildRegisterClothingBody(
  draft: ClothingDraft,
  photoIds: string[],
): RegisterClothingBody {
  const measurements: Partial<Record<MeasurementField, number>> = {};
  for (const [field, raw] of Object.entries(draft.measurements)) {
    const value = raw?.trim() ?? '';
    if (value === '') continue;
    measurements[field as MeasurementField] = Number(value);
  }
  const body: RegisterClothingBody = {
    photoIds,
    category: draft.category as Exclude<ClothingCategoryValue, ''>,
    title: draft.title.trim(),
    description: draft.description.trim(),
  };
  if (Object.keys(measurements).length > 0) {
    body.measurements = measurements;
  }
  return body;
}
