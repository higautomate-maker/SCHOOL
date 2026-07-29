import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

type RepositoryOperation = {
  id: string;
  repository: string;
  atomicWrites: string[];
  idempotencyRequired: boolean;
  rowLockRequired: boolean;
};

const manifest = JSON.parse(
  readFileSync("tests/contracts/repository-transactions.contract.json", "utf8"),
) as { operations: RepositoryOperation[] };

test("transaction manifest points to current repositories and complete write sets", () => {
  const ids = new Set<string>();
  for (const operation of manifest.operations) {
    assert.ok(!ids.has(operation.id), `duplicate operation ${operation.id}`);
    ids.add(operation.id);
    assert.equal(existsSync(operation.repository), true, operation.repository);
    assert.ok(operation.atomicWrites.length >= 2, `${operation.id} is missing its audit/outbox write set`);
    assert.equal(operation.idempotencyRequired, true, `${operation.id} needs an explicit replay policy`);
  }
});

test("fee collection contract requires a row lock", () => {
  const payment = manifest.operations.find((operation) => operation.id === "fee.payment.collect");
  assert.ok(payment);
  assert.equal(payment.rowLockRequired, true);
  assert.ok(payment.atomicWrites.includes("fee_invoice_balance"));
  assert.ok(payment.atomicWrites.includes("idempotency_record"));
});

for (const operation of manifest.operations) {
  test.todo(`${operation.id}: PostgreSQL transaction rolls back every atomic write on failure`);
  test.todo(`${operation.id}: repeated idempotency key returns the original committed result`);
}
