import { expireOverdueOrders } from "../src/lib/orders/index.js";

const result = await expireOverdueOrders();

console.log(JSON.stringify(result, null, 2));
