import { test } from "node:test";
import { equal, match } from "node:assert/strict";
import { formatStatusLine } from "../src/format.mjs";

test("distinguishes native session cost from latest response tokens", () => {
  equal(
    formatStatusLine({
      model: { id: "claude-sonnet-4-5", display_name: "Sonnet" },
      cost: { total_cost_usd: 0.01234 },
      context_window: {
        current_usage: {
          input_tokens: 8500,
          output_tokens: 1200,
          cache_creation_input_tokens: 5000,
          cache_read_input_tokens: 2000,
        },
      },
    }),
    "Claude session estimate $0.01234 | latest: 15500 in / 1200 out | cached 12.9%",
  );
  match(formatStatusLine({}), /session cost unavailable/);
  match(
    formatStatusLine({ context_window: { current_usage: null } }),
    /latest response unavailable/,
  );
});

test("rejects invalid payloads instead of showing zero", () => {
  for (
    const input of [
      null,
      [],
      "text",
      { cost: { total_cost_usd: -1 } },
      { cost: {} },
      { cost: { total_cost_usd: "1" } },
      { context_window: [] },
      { context_window: { current_usage: { input_tokens: 1 } } },
      {
        context_window: {
          current_usage: {
            input_tokens: 1.5,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]
  ) {
    match(formatStatusLine(input), /invalid payload/);
  }
});
