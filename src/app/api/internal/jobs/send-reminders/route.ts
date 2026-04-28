import type { NextRequest } from "next/server";

import { runInternalJobRoute } from "@/app/api/_utils/internal-jobs";
import { sendReminderNotifications } from "@/lib/jobs/send-reminders";

export async function POST(request: NextRequest) {
  return runInternalJobRoute(request, {
    jobName: "notifications.sendReminders",
    run: () => sendReminderNotifications()
  });
}
