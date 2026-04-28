type StructuredLogLevel = "info" | "warn" | "error";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unknown error.";
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }

  return {
    name: "Error",
    message: getErrorMessage(error),
    stack: null
  };
}

export function logStructuredEvent(
  level: StructuredLogLevel,
  event: string,
  details: Record<string, unknown> = {}
) {
  const payload = JSON.stringify({
    event,
    timestampUtc: new Date().toISOString(),
    ...details
  });

  switch (level) {
    case "warn":
      console.warn(payload);
      return;
    case "error":
      console.error(payload);
      return;
    default:
      console.info(payload);
  }
}
