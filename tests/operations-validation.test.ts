import test from "node:test";
import assert from "node:assert/strict";
import { operationActionSchema } from "../server/operations/validation.ts";

test("accepts attendance, invoice and payment operations",()=>{
  assert.equal(operationActionSchema.safeParse({action:"mark_attendance",studentId:"9bf9c257-1e64-4de3-91b9-af841281ac90",attendanceDate:"2026-07-22",status:"present",note:""}).success,true);
  assert.equal(operationActionSchema.safeParse({action:"create_invoice",studentId:"9bf9c257-1e64-4de3-91b9-af841281ac90",feeType:"Tuition fee",amountPaise:250000,dueDate:"2026-07-31"}).success,true);
  assert.equal(operationActionSchema.safeParse({action:"record_payment",invoiceId:"5f25ec84-7d99-48db-91b6-8825c10ceee9",amountPaise:100000,method:"upi",reference:"UPI-104"}).success,true);
});

test("rejects invalid money and attendance status",()=>{
  assert.equal(operationActionSchema.safeParse({action:"create_invoice",studentId:"bad",feeType:"X",amountPaise:-1,dueDate:"today"}).success,false);
  assert.equal(operationActionSchema.safeParse({action:"mark_attendance",studentId:"9bf9c257-1e64-4de3-91b9-af841281ac90",attendanceDate:"2026-07-22",status:"holiday"}).success,false);
});
