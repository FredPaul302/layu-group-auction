import { sendReminderNotifications } from "../src/lib/jobs/send-reminders.js";

const result = await sendReminderNotifications();

console.log(JSON.stringify(result, null, 2));
