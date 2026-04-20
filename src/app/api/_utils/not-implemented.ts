import { NextResponse } from "next/server";

export function notImplementedResponse(
  routeId: string,
  methods: string[],
  detail?: string
) {
  return NextResponse.json(
    {
      routeId,
      status: "not_implemented",
      methods,
      detail: detail ?? "This route is scaffolded but has no business logic yet."
    },
    {
      status: 501
    }
  );
}
