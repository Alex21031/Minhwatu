import fs from "node:fs";
import path from "node:path";

import { AccountService } from "../account-service.js";

const accountStorePath = process.env.ACCOUNT_STORE_PATH ?? path.resolve(process.cwd(), "data", "accounts.json");
const tableStorePath = process.env.TABLE_STORE_PATH ?? path.resolve(process.cwd(), "data", "table-state.json");

const accountService = new AccountService({
  storagePath: accountStorePath
});

const accountResetResult = accountService.resetToAdminOnly();

const emptyTableState = {
  rooms: [],
  setupStates: [],
  playStates: [],
  actionLogs: [],
  roundHistory: []
};

fs.mkdirSync(path.dirname(tableStorePath), { recursive: true });
fs.writeFileSync(tableStorePath, JSON.stringify(emptyTableState, null, 2));

console.log(
  JSON.stringify(
    {
      accountStorePath,
      tableStorePath,
      removedUserIds: accountResetResult.removedUserIds,
      removedUserCount: accountResetResult.removedUserIds.length,
      keptAdminUserId: accountResetResult.adminUserId,
      tableStateReset: true
    },
    null,
    2
  )
);
