export const logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[vr] ${msg}`, ctx ?? ''),
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) =>
    console.error(`[vr] ${msg}`, err, ctx ?? ''),
};
