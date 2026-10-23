UPDATE "Room"
SET "building" = substring("roomCode" FROM 1 FOR 1),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "roomCode" IN (
    '243', '251', '252', '253', '423', '424', '733', '751',
    '752', '821', '831', '832', '841', '851', '862'
);
