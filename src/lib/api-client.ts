export class ApiError extends Error {
  constructor(
    message: string,
    readonly details?: { fieldErrors?: Record<string, string[]>; blockers?: string[] } | null,
  ) {
    super(message);
  }
  /** First error message for a field, from the server's Zod validation. */
  field(name: string): string | undefined {
    return this.details?.fieldErrors?.[name]?.[0];
  }
}

export async function api<T = unknown>(path: string, method: "GET" | "POST" | "PUT" | "PATCH", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error?.message ?? "Request failed", json.error?.details);
  return json.data as T;
}

export const toCents = (etb: string | number): number => Math.round(Number(etb) * 100);
export const fromCents = (cents: number): string => (cents / 100).toString();
export const minutesToTime = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMinutes = (t: string, isEnd = false): number => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const v = h * 60 + m;
  return isEnd && v === 0 ? 1440 : v;
};
