import { expireRunnerUpOffers } from "../src/lib/auctions/index.js";

const result = await expireRunnerUpOffers();

console.log(JSON.stringify(result, null, 2));
