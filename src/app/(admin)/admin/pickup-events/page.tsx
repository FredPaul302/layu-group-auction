import { PageHeader } from "@/components/ui/page-header";
import { createPickupEventAction, updatePickupEventAction } from "@/lib/catalog/actions";
import { formatDateTimeLocalValue, formatUtcDateTime } from "@/lib/catalog/presentation";
import { listPickupEventsForAdmin, readStatusQueryParam } from "@/lib/catalog/service";

type AdminPickupEventsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Feedback({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div className={tone === "error" ? "notice notice-danger" : "notice notice-success"}>
      {message}
    </div>
  );
}

export default async function AdminPickupEventsPage({
  searchParams
}: AdminPickupEventsPageProps) {
  const resolvedSearchParamsPromise =
    searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>);
  const [pickupEvents, resolvedSearchParams] = await Promise.all([
    listPickupEventsForAdmin(),
    resolvedSearchParamsPromise
  ]);
  const status = readStatusQueryParam(resolvedSearchParams.status);
  const error = readStatusQueryParam(resolvedSearchParams.error);

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <p>
            Pickup events support batch handoff for paid items. Listings can attach to these
            windows, but fulfillment completion stays manual and under admin review.
          </p>
        }
        eyebrow="Admin"
        meta={
          <div className="metric-card">
            <span className="meta-label">Pickup windows</span>
            <span className="meta-value tabular-data">{pickupEvents.length}</span>
          </div>
        }
        title="Pickup events"
      />

      {status === "pickup_event_saved" ? (
        <Feedback message="Pickup event saved." tone="success" />
      ) : null}
      {status === "pickup_event_updated" ? (
        <Feedback message="Pickup event updated." tone="success" />
      ) : null}
      {error ? (
        <Feedback
          message={`Pickup event changes could not be saved (${error.replaceAll("_", " ")}).`}
          tone="error"
        />
      ) : null}

      <section className="surface-card fade-in space-y-4 p-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-950">Create pickup event</h3>
          <p className="text-sm text-zinc-600">
            Event times are stored in UTC after form submission.
          </p>
        </div>

        <form action={createPickupEventAction} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Name</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="name" required />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Slug</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="slug" />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Start date and time</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              name="startAtUtc"
              required
              type="datetime-local"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">End date and time</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              name="endAtUtc"
              required
              type="datetime-local"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Location name</span>
            <input
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              name="locationName"
              required
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Address</span>
            <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="address" />
          </label>

          <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
            <span className="font-medium text-zinc-900">Instructions</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
              name="instructions"
            />
          </label>

          <div className="md:col-span-2">
            <button
              className="button-primary px-4 py-2 text-sm font-medium"
              type="submit"
            >
              Save pickup event
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-950">Existing pickup events</h3>
          <p className="text-sm text-zinc-600">
            Listings can attach to any active event shown here.
          </p>
        </div>

        <div className="space-y-4">
          {pickupEvents.map((pickupEvent) => (
            <form
              key={pickupEvent.id}
              action={updatePickupEventAction.bind(null, pickupEvent.id)}
              className="surface-card fade-in grid gap-4 p-5 md:grid-cols-2"
            >
              <div className="space-y-1 md:col-span-2">
                <h4 className="text-lg font-semibold text-zinc-950">{pickupEvent.name}</h4>
                <p className="text-sm text-zinc-600">
                  {formatUtcDateTime(pickupEvent.startAtUtc)} to{" "}
                  {formatUtcDateTime(pickupEvent.endAtUtc)}
                </p>
              </div>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Name</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={pickupEvent.name}
                  name="name"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Slug</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={pickupEvent.slug}
                  name="slug"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Start date and time</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={formatDateTimeLocalValue(pickupEvent.startAtUtc)}
                  name="startAtUtc"
                  required
                  type="datetime-local"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">End date and time</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={formatDateTimeLocalValue(pickupEvent.endAtUtc)}
                  name="endAtUtc"
                  required
                  type="datetime-local"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Location name</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={pickupEvent.locationName}
                  name="locationName"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">Address</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={pickupEvent.address ?? ""}
                  name="address"
                />
              </label>

              <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
                <span className="font-medium text-zinc-900">Instructions</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
                  defaultValue={pickupEvent.instructions ?? ""}
                  name="instructions"
                />
              </label>

              <div className="md:col-span-2">
                <button
                  className="button-secondary px-4 py-2 text-sm font-medium"
                  type="submit"
                >
                  Update pickup event
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
