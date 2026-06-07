/**
 * parseJsonSafe — robust JSON parsing for LLM output.
 *
 * Gemini's structured-output mode is supposed to return valid JSON, but in
 * practice the model sometimes:
 *   - wraps the JSON in ```json ... ``` fences
 *   - leaves trailing prose like "Let me know if you need more."
 *   - embeds literal "\n" or "\t" escapes inside string values
 *   - drops a closing brace under token pressure
 *
 * This helper:
 *   1. Tries a direct JSON.parse.
 *   2. Strips ```json ... ``` fences and retries.
 *   3. Extracts the first balanced { ... } block and retries.
 *   4. As a last resort, returns null.
 *
 * Callers (sub-agents) should treat null as a fallback signal and
 * synthesise a default object, not throw.
 */
export function parseJsonSafe<T = unknown>(text: string): T | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.trim();

  // 1. Direct parse.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue
  }

  // 2. Strip ```json ... ``` fences.
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1] !== undefined) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // 3. Extract the first balanced { ... } block.
  const first = cleaned.indexOf("{");
  if (first === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = first; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const block = cleaned.slice(first, end + 1);
  try {
    return JSON.parse(block) as T;
  } catch {
    // continue
  }

  // 4. Last-ditch: replace literal "\n" and "\t" inside the block with
  //    real whitespace. Some models double-escape.
  const unescaped = block.replace(/\\n/g, " ").replace(/\\t/g, " ");
  try {
    return JSON.parse(unescaped) as T;
  } catch {
    return null;
  }
}
