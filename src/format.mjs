/** Render the status line from Claude Code's documented stdin payload. Pure. */

const INVALID = "Claude usage unavailable (invalid payload)";
const COUNTS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function formatStatusLine(input) {
  if (!isObject(input)) return INVALID;
  const { cost: costField, context_window: context } = input;
  if (costField !== undefined) {
    const value = isObject(costField) ? costField.total_cost_usd : undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return INVALID;
    }
  }
  if (context !== undefined && !isObject(context)) return INVALID;
  const usage = context?.current_usage;
  if (
    usage !== undefined && usage !== null &&
    !(isObject(usage) && COUNTS.every((key) => isCount(usage[key])))
  ) {
    return INVALID;
  }
  const cost = costField?.total_cost_usd;
  const session = cost === undefined
    ? "session cost unavailable"
    : `Claude session estimate $${cost.toFixed(5)}`;
  if (!usage) return `${session} | latest response unavailable`;
  // Cache reads and writes are disjoint from input_tokens; count each once.
  const totalInput = usage.input_tokens + usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens;
  if (!Number.isSafeInteger(totalInput)) {
    return `${session} | latest response invalid`;
  }
  const cached = totalInput
    ? `${(100 * usage.cache_read_input_tokens / totalInput).toFixed(1)}%`
    : "n/a";
  return `${session} | latest: ${totalInput} in / ${usage.output_tokens} out | cached ${cached}`;
}
