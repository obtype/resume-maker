/** Set a value at a dotted path such as "experience.0.bullets.2". */
export function pathSet(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const key: string | number = /^\d+$/.test(part) ? Number(part) : part;
    const container = current as Record<string | number, unknown>;
    let next = container[key];
    if (next == null || typeof next !== "object") {
      next = /^\d+$/.test(parts[i + 1]) ? [] : {};
      container[key] = next;
    }
    current = next as Record<string, unknown> | unknown[];
  }
  const last = parts[parts.length - 1];
  const key: string | number = /^\d+$/.test(last) ? Number(last) : last;
  (current as Record<string | number, unknown>)[key] = value;
}
