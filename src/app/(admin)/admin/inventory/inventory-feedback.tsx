const successMessages: Record<string, string> = {
  purchase_order_saved: "Purchase order saved as a draft. Receive it when the goods arrive to add stock.",
  purchase_order_received: "Purchase order received. Stock and purchase history are updated.",
  inventory_adjusted: "Inventory adjustment recorded.",
  inventory_allocated: "One unit allocated to the listing.",
  inventory_released: "The listing allocation was released.",
  selling_cost_saved: "Selling costs saved. Contribution reflects the amount entered."
};

export type InventorySearchParams = Record<string, string | string[] | undefined>;

export function queryValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function InventoryFeedback({ params }: { params: InventorySearchParams }) {
  const error = queryValue(params.error);
  const message = successMessages[queryValue(params.status)];

  return (
    <>
      {error ? <p className="notice notice-danger" role="alert">{error.slice(0, 500)}</p> : null}
      {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    </>
  );
}
