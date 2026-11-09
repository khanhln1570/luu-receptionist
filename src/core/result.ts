export type Result = { ok: true } | { ok: false; error: string };

export const ok: Result = { ok: true };
export const fail = (error: string): Result => ({ ok: false, error });
