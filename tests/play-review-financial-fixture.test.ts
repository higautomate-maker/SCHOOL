import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/provision-production-play-review.mjs", "utf8");
const invoiceInsert = source.match(/INSERT INTO fee_invoices[\s\S]*?\[ids\.feeInvoice/);

test("synthetic Play-review invoice never claims unrecorded payment", () => {
  assert.ok(invoiceInsert, "Play-review fixture must create an invoice");
  assert.match(invoiceInsert[0], /'Term fee',225000,0,[\s\S]*?'due'/);
  assert.match(invoiceInsert[0], /ON CONFLICT \(tenant_id,id\) DO NOTHING/);
  assert.doesNotMatch(invoiceInsert[0], /paid_paise\s*=/);
});
