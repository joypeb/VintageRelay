// TypeScript 6은 CSS side-effect import에 타입 선언이 필요하다.
// next-env.d.ts는 Next.js가 재생성하므로 별도 파일에 둔다.
declare module '*.css';
