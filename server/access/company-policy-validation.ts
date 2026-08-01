import { z } from "zod";
import {
  appAudiences,
  appFeatureCatalogue,
  schoolModuleKeys,
} from "./catalogue.ts";

const schoolModuleValues = [...schoolModuleKeys] as [
  typeof schoolModuleKeys[number],
  ...typeof schoolModuleKeys[number][],
];
const appAudienceValues = [...appAudiences] as [
  typeof appAudiences[number],
  ...typeof appAudiences[number][],
];

export const companySchoolModuleKeySchema = z.enum(schoolModuleValues);
export const companyAppAudienceSchema = z.enum(appAudienceValues);

const setSchoolModuleSchema = z.object({
  action: z.literal("set_module"),
  moduleKey: companySchoolModuleKeySchema,
  enabled: z.boolean(),
});

const setAppFeatureSchema = z.object({
  action: z.literal("set_app_feature"),
  audience: companyAppAudienceSchema,
  featureKey: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
}).superRefine((value, context) => {
  const exists = appFeatureCatalogue.some((feature) =>
    feature.persona === value.audience && feature.key === value.featureKey
  );
  if (!exists) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["featureKey"],
      message: "Feature does not belong to the selected app audience",
    });
  }
});

export const companyAccessActionSchema = z.union([
  setSchoolModuleSchema,
  setAppFeatureSchema,
]);

export type CompanyAccessAction = z.infer<typeof companyAccessActionSchema>;
