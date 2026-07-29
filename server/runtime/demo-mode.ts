export type DemoModeEnvironment = {
  NODE_ENV?: string;
  HIG_SALES_DEMO?: string;
};

export function isSalesDemoAllowed(environment: DemoModeEnvironment): boolean {
  return environment.NODE_ENV !== "production" && environment.HIG_SALES_DEMO === "true";
}

export function assertSalesDemoAllowed(environment: DemoModeEnvironment): void {
  if (!isSalesDemoAllowed(environment)) {
    throw new Error("Sales demo mode is disabled");
  }
}
