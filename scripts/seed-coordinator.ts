import "dotenv/config";

import { ensureCoordinatorSeeded } from "../lib/auth";

ensureCoordinatorSeeded()
  .then(() => {
    console.log("Coordinator seed check complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
