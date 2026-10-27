import { cn } from './cn';

describe('cn', () => {
  it('keeps the last conflicting Tailwind class', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('ignores falsy values', () => {
    expect(cn('text-primary', false, undefined, 'font-bold')).toBe('text-primary font-bold');
  });
});
