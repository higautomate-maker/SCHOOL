export type DemoModeEnvironment = {
  NODE_ENV?: string;
  HIG_SALES_DEMO?: string;
  HIG_DEPLOYMENT_ENV?: string;
};

export function isSalesDemoAllowed(environment: DemoModeEnvironment): boolean {
  return environment.HIG_SALES_DEMO === "true"
    && (
      environment.NODE_ENV !== "production"
      || environment.HIG_DEPLOYMENT_ENV === "sales-demo"
    );
}

export function assertSalesDemoAllowed(environment: DemoModeEnvironment): void {
  if (!isSalesDemoAllowed(environment)) {
    throw new Error("Sales demo mode is disabled");
  }
}
