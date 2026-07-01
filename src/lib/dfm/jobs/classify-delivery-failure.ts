export type DeliveryFailureDisposition = "retry" | "terminal";

export interface DeliveryFailureClassification {
  disposition: DeliveryFailureDisposition;
  reason: string;
  retryDelayMs?: number;
}

export function classifyDeliveryFailure(error: unknown): DeliveryFailureClassification {
  const message = error instanceof Error ? error.message : "Unknown delivery failure";

  if (message.includes("429") || message.includes("5")) {
    return {
      disposition: "retry",
      reason: message,
      retryDelayMs: 5 * 60 * 1000,
    };
  }

  if (message.toLowerCase().includes("unauthorized") || message.includes("401") || message.includes("403")) {
    return {
      disposition: "terminal",
      reason: message,
    };
  }

  if (message.toLowerCase().includes("missing") || message.toLowerCase().includes("invalid")) {
    return {
      disposition: "terminal",
      reason: message,
    };
  }

  return {
    disposition: "retry",
    reason: message,
    retryDelayMs: 5 * 60 * 1000,
  };
}
