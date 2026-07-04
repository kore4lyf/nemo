// Shared response shape used by every tool in the codebase.
// Success: { success: true, ...extra }
// Failure: { success: false, error: "<message>" }
export const ok = (extra = {}) => ({ success: true, ...extra });
export const fail = (error) => ({ success: false, error: String(error) });
