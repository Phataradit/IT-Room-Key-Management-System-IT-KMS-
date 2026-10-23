INSERT INTO "Room" (
    "id",
    "roomCode",
    "roomName",
    "building",
    "floor",
    "roomType",
    "status",
    "createdAt",
    "updatedAt"
)
VALUES
    ('room-243', '243', 'ห้อง 243', 'อาคาร 2', '4', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-251', '251', 'ห้อง 251', 'อาคาร 2', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-252', '252', 'ห้อง 252', 'อาคาร 2', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-253', '253', 'ห้อง 253', 'อาคาร 2', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-423', '423', 'ห้อง 423', 'อาคาร 4', '2', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-424', '424', 'ห้อง 424', 'อาคาร 4', '2', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-733', '733', 'ห้อง 733', 'อาคาร 7', '3', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-751', '751', 'ห้อง 751', 'อาคาร 7', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-752', '752', 'ห้อง 752', 'อาคาร 7', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-821', '821', 'ห้อง 821', 'อาคาร 8', '2', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-831', '831', 'ห้อง 831', 'อาคาร 8', '3', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-832', '832', 'ห้อง 832', 'อาคาร 8', '3', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-841', '841', 'ห้อง 841', 'อาคาร 8', '4', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-851', '851', 'ห้อง 851', 'อาคาร 8', '5', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('room-862', '862', 'ห้อง 862', 'อาคาร 8', '6', 'OTHER', 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("roomCode") DO UPDATE SET
    "roomName" = EXCLUDED."roomName",
    "building" = EXCLUDED."building",
    "floor" = EXCLUDED."floor",
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Room"
SET "status" = 'DISABLED',
    "deletedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "roomCode" IN ('823', '861')
  AND "deletedAt" IS NULL;
