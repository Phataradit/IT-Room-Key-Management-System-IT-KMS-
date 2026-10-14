export function getExpiryStages(endsAt, now, reminderMinutes, overdueMinutes) {
  const endTime = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(endTime) || !Number.isFinite(currentTime)) {
    throw new RangeError("Expiry and current times must be valid dates");
  }
  if (endTime > currentTime) {
    return endTime - currentTime <= reminderMinutes * 60_000 ? ["ENDING_SOON"] : [];
  }
  return [
    "ENDED",
    ...overdueMinutes
      .filter((minutes) => currentTime >= endTime + minutes * 60_000)
      .map((minutes) => `OVERDUE_${minutes}`),
  ];
}

export function notificationDedupeBase(sourceType, sourceId, endsAt, stage) {
  const endTime = endsAt instanceof Date ? endsAt.toISOString() : new Date(endsAt).toISOString();
  return `${sourceType}:${sourceId}:${endTime}:${stage}`;
}
