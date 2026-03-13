import path from "node:path";

import { AccountService } from "../account-service.js";

const storagePath = process.env.ACCOUNT_STORE_PATH ?? path.resolve(process.cwd(), "data", "accounts.json");
const service = new AccountService({ storagePath });
const result = service.purgeNonAdminAccounts();

console.log(
  JSON.stringify(
    {
      storagePath,
      removedUserIds: result.removedUserIds,
      removedCount: result.removedUserIds.length
    },
    null,
    2
  )
);
