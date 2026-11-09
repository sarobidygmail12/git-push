import { cp } from "node:fs/promises";

await cp("src/web/pages", "dist/web/pages", { recursive: true });
