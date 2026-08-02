import { z } from "zod";

export const moduleKeys=["Dashboard","Finance & Fees","Accounts","Student Information","Academics","Front Office","Lead Management","Offline Examinations","CBC Academics","Online Examinations","Human Resource","PTM Meetings","Lesson Planner","OSM Module","QR Code Attendance","Assessment","Live Classes","Study Center","Certificates","Communicate","Library","Inventory","Transport","Hostel","Help Center","Asset Management","Reports & Analytics","Settings & Billing","Apps Center","Comms Wallet"] as const;
const moduleKey=z.enum(moduleKeys);

export const workspaceActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create_record"),moduleKey,workflow:z.string().trim().min(2).max(80),title:z.string().trim().min(2).max(140),description:z.string().trim().max(1200).default(""),recordDate:z.iso.date(),dueDate:z.union([z.iso.date(),z.literal("")]).default(""),amountPaise:z.number().int().min(0).max(1_000_000_000).nullable().default(null),assignee:z.string().trim().max(100).default(""),priority:z.enum(["low","normal","high","urgent"]).default("normal")}),
  z.object({action:z.literal("update_status"),recordId:z.string().uuid(),status:z.enum(["draft","open","in_progress","completed","cancelled"])}),
]);
export type WorkspaceAction=z.infer<typeof workspaceActionSchema>;
