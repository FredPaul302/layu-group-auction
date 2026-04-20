async function seed() {
  const timestampUtc = new Date().toISOString();

  console.log(
    JSON.stringify(
      {
        seed: "placeholder",
        status: "skipped",
        timestampUtc,
        notes: [
          "No seed data is installed yet.",
          "Add seed fixtures when the first schema-backed flows are implemented."
        ]
      },
      null,
      2
    )
  );
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
