export type ExpiryStage = "ENDING_SOON" | "ENDED" | `OVERDUE_${number}`;
export function getExpiryStages(
  endsAt: Date | string,
  now: Date | string,
  reminderMinutes: number,
  overdueMinutes: number[],
): ExpiryStage[];
export function notificationDedupeBase(
  sourceType: string,
  sourceId: string,
  endsAt: Date | string,
  stage: string,
): string;
