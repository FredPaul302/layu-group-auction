import { createStubJob } from "./create-stub-job";

export const sendReminderNotifications = createStubJob("notifications.sendReminders", [
  "Reminder delivery is intentionally deferred until reminder-send dedupe is persisted.",
  "This job currently performs no reminder sends and is safe to leave unscheduled until reservation reminder state can be tracked."
]);
