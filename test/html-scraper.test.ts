import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtmlEntities,
  parsePricingFromHtml,
  parseUsageLevel,
  parseMarkdownTable,
} from "../src/utils/html.js";

test("decodeHtmlEntities unescapes common HTML entities", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeHtmlEntities("It&#39;s sunny"), "It's sunny");
  assert.equal(decodeHtmlEntities("&quot;Hello&quot;"), '"Hello"');
  assert.equal(decodeHtmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeHtmlEntities("Word&nbsp;Break"), "Word Break");
  assert.equal(decodeHtmlEntities("**Bold** Text"), "Bold Text");
});

test("parsePricingFromHtml extracts input, output, and cached costs", () => {
  const html = `
    <div>Cost per 1M tokens</div>
    <div>$0.15</div>
    <div>input</div>
    <div>0.50</div>
    <div>output</div>
    <div>0.03</div>
    <div>cached</div>
  `;
  const pricing = parsePricingFromHtml(html);
  assert.ok(pricing);
  assert.equal(pricing.input, 0.15);
  assert.equal(pricing.output, 0.5);
  assert.equal(pricing.cached, 0.03);

  const empty = parsePricingFromHtml("<div>No pricing information here</div>");
  assert.equal(empty, null);
});

test("parseUsageLevel normalizes text to tier numbers", () => {
  assert.equal(parseUsageLevel("Low"), 1);
  assert.equal(parseUsageLevel("Low Usage"), 1);
  assert.equal(parseUsageLevel("Medium"), 2);
  assert.equal(parseUsageLevel("High"), 3);
  assert.equal(parseUsageLevel("Extra High"), 4);
  assert.equal(parseUsageLevel("Very High"), 4);
  assert.equal(parseUsageLevel("4"), 4);
  assert.equal(parseUsageLevel("invalid"), 1);
  assert.equal(parseUsageLevel(null), 1);
});

test("parseMarkdownTable parses markdown benchmark table into structured rows", () => {
  const table = `
| Benchmark | Model A | Model B |
| --- | --- | --- |
| **Coding** | | |
| HumanEval | 85.2 | 78.4 |
| SWE-bench | 45.0 | 38.2 |
| **Math** | | |
| GSM8K | 92.0 | 90.5 |
  `.trim();

  const parsed = parseMarkdownTable(table);
  assert.ok(parsed);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].category, "Coding");
  assert.equal(parsed.rows[0].benchmark, "HumanEval");
  assert.equal(parsed.rows[0].scores["Model A"], 85.2);
  assert.equal(parsed.rows[0].scores["Model B"], 78.4);
  assert.equal(parsed.rows[2].category, "Math");
  assert.equal(parsed.rows[2].benchmark, "GSM8K");
});
