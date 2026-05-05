type DiditCreateSessionResponse = {
  session_id?: string;
  url?: string;
  verification_url?: string;
  workflow_id?: string;
  vendor_data?: string;
  status?: string;
};

type CreateDiditSessionInput = {
  apiKey: string;
  baseUrl: string;
  callback: string;
  vendorData: string;
  workflowId: string;
};

type FetchLike = typeof fetch;

function getDiditSessionEndpoint(baseUrl: string) {
  return new URL("/v3/session/", baseUrl).toString();
}

export async function createDiditHostedSession(
  input: CreateDiditSessionInput,
  fetchFn: FetchLike = fetch
) {
  const response = await fetchFn(getDiditSessionEndpoint(input.baseUrl), {
    body: JSON.stringify({
      workflow_id: input.workflowId,
      vendor_data: input.vendorData,
      callback: input.callback
    }),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Didit session creation failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as DiditCreateSessionResponse;
  const sessionId = payload.session_id;
  const redirectUrl = payload.verification_url ?? payload.url;

  if (!sessionId || !redirectUrl) {
    throw new Error("Didit session response did not include a session ID and redirect URL.");
  }

  return {
    redirectUrl,
    sessionId,
    status: payload.status ?? null,
    vendorData: payload.vendor_data ?? input.vendorData,
    workflowId: payload.workflow_id ?? input.workflowId
  };
}
