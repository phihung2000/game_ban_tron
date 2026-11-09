import { createClient } from '@supabase/supabase-js';
import { roomStorage } from '../mobile/platform';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured = Boolean(url && key);
// sessionStorage tách phiên theo tab, thuận tiện kiểm thử nhiều người trên cùng máy.
export const supabase = createClient(url || 'https://example.supabase.co', key || 'not-configured', {
  auth: { storage: roomStorage(), storageKey: 'ban-tron-auth', persistSession: true },
});

export class RpcError extends Error {
  constructor(message: string, readonly code = '') { super(message); this.name = 'RpcError'; }
}
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) throw new RpcError(error.message, error.code);
    if (data?._error) throw new RpcError(data._error.message, data._error.code);
    return data as T;
  } finally { clearTimeout(timer); }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}
