/**
 * Safe JSON response helper to prevent "Unexpected end of JSON input" errors.
 */
export async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text || !text.trim()) {
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }
    return {} as T;
  }
  
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }
    throw new Error("Invalid response format received from server");
  }

  if (!res.ok) {
    throw new Error(data?.message || `HTTP Error ${res.status}`);
  }

  return data as T;
}
