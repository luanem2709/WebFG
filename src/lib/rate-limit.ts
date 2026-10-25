const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(identifier: string, max: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let window = windows.get(identifier);

  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + windowMs };
    windows.set(identifier, window);
  }

  window.count++;
  const remaining = Math.max(0, max - window.count);

  return {
    allowed: window.count <= max,
    remaining,
    resetAt: window.resetAt,
  };
}

export function clearRateLimit(identifier: string) {
  windows.delete(identifier);
}
