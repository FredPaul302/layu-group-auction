import { closeExpiredAuctions } from "../src/lib/auctions/index.js";

const result = await closeExpiredAuctions();

console.log(JSON.stringify(result, null, 2));
