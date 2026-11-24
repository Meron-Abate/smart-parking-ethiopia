import en from "./en.json";

// Amharic: add am.json with the same keys and select by user.profile.language (Phase 8).
const messages = { en } as const;
export type MessageKey = keyof typeof en;

export function t(key: MessageKey, vars: Record<string, string> = {}, locale: keyof typeof messages = "en"): string {
  let s: string = messages[locale][key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
