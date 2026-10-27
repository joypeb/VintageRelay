import { cn } from './cn';

describe('cn', () => {
  it('충돌하는 Tailwind 클래스는 뒤의 값을 남긴다', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('거짓 값은 무시한다', () => {
    expect(cn('text-primary', false, undefined, 'font-bold')).toBe('text-primary font-bold');
  });
});
