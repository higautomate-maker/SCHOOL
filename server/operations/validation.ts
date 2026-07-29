import { z } from "zod";

export const operationActionSchema = z.discriminatedUnion("action", [
  z.object({ action:z.literal("mark_attendance"), studentId:z.string().uuid(), attendanceDate:z.iso.date(), status:z.enum(["present","absent","late","excused"]), note:z.string().trim().max(240).default("") }),
  z.object({ action:z.literal("create_invoice"), studentId:z.string().uuid(), feeType:z.string().trim().min(2).max(80), amountPaise:z.number().int().min(100).max(100_000_000), dueDate:z.iso.date() }),
  z.object({ action:z.literal("record_payment"), invoiceId:z.string().uuid(), amountPaise:z.number().int().min(100).max(100_000_000), method:z.enum(["cash","card","upi","bank"]), reference:z.string().trim().max(80).default("") }),
]);

export type OperationAction = z.infer<typeof operationActionSchema>;
