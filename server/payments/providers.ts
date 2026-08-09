export type PaymentGatewayProvider = {
  gatewayId: "" | "3" | "7" | "12";
  key: "none" | "razorpay" | "upi_qr" | "bank_transfer";
  name: string;
  kind: "none" | "online" | "manual";
  currency: "INR";
  webhook: boolean;
};

export const paymentGatewayProviders: readonly PaymentGatewayProvider[] = [
  {
    gatewayId: "",
    key: "none",
    name: "No payment gateway",
    kind: "none",
    currency: "INR",
    webhook: false,
  },
  {
    gatewayId: "3",
    key: "razorpay",
    name: "Razorpay — India",
    kind: "online",
    currency: "INR",
    webhook: true,
  },
  {
    gatewayId: "7",
    key: "upi_qr",
    name: "UPI QR — India",
    kind: "manual",
    currency: "INR",
    webhook: false,
  },
  {
    gatewayId: "12",
    key: "bank_transfer",
    name: "Bank Transfer — India",
    kind: "manual",
    currency: "INR",
    webhook: false,
  },
] as const;

export function paymentGatewayProviderById(
  gatewayId: string,
): PaymentGatewayProvider | null {
  return paymentGatewayProviders.find(
    (provider) => provider.gatewayId === gatewayId,
  ) ?? null;
}

export function supportedPaymentGatewayId(gatewayId: string): boolean {
  return paymentGatewayProviderById(gatewayId) !== null;
}
