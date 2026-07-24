import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /**
   * Performs standard RPC call to Supabase.
   */
  async callRpc(fn: string, params: any = {}): Promise<any[]> {
    const { data, error } = await this.client.rpc(fn, params);
    if (error) {
      console.error(`RPC ${fn} failed:`, error.message, params);
      return [];
    }
    return data || [];
  }

  /**
   * Resilient RPC call with retries and exponential backoff.
   */
  async callRpcWithRetry(
    fn: string,
    params: any = {},
    retries = 2
  ): Promise<{ ok: boolean; data: any[]; error?: any }> {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { data, error } = await this.client.rpc(fn, params);
      if (!error) return { ok: true, data: data || [] };
      lastErr = error;
      console.error(`RPC ${fn} failed (attempt ${attempt + 1}/${retries + 1}):`, error.message, params);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    return { ok: false, data: [], error: lastErr };
  }
}
