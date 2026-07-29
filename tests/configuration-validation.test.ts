import test from "node:test";
import assert from "node:assert/strict";
import { configurationActionSchema } from "../server/configuration/validation.ts";

test("accepts a detailed payment gateway configuration", () => {
  const parsed = configurationActionSchema.safeParse({ action:"update_gateway", enabled:true, gatewayId:"7", paymentMode:"live", credentials:{ upi_id:"fees@upi", merchant_name:"Hig School" }, surchargeEnabled:true, surchargeType:"percentage", surchargeValue:1.5, surchargeLabel:"Convenience fee" });
  assert.equal(parsed.success, true);
});

test("rejects invalid gateway surcharge values", () => {
  const parsed = configurationActionSchema.safeParse({ action:"update_gateway", enabled:true, gatewayId:"7", paymentMode:"live", credentials:{}, surchargeEnabled:true, surchargeType:"percentage", surchargeValue:-1, surchargeLabel:"Fee" });
  assert.equal(parsed.success, false);
});
