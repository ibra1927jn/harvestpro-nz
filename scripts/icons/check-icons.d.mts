export interface IconSubsetCheck {
  ok: boolean;
  problems: string[];
  missing: { name: string; files: string[] }[];
  extra: string[];
  used: number;
}
export function checkIconSubset(): IconSubsetCheck;
