const secret = process.env.CRON_SECRET;
if (!secret) {
  throw new Error("CRON_SECRET is not set in .env");
}

const endpoint = process.env.ROOM_NOTIFICATION_JOB_URL
  ?? "http://localhost:3000/api/cron/room-usage-notifications";
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
const result = await response.json();

if (!response.ok || result.success !== true) {
  throw new Error(`Room notification job failed (${response.status}): ${result.message ?? "Unknown error"}`);
}

console.log("Room notification job completed:", result.data);
