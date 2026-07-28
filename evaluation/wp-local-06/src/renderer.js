async function run() {
  const plan = await window.wpLocal06.getPlan();
  const results = [];
  for (const scenario of plan) {
    results.push(await window.wpLocal06.run(scenario));
  }
  window.wpLocal06.complete(results);
}

run().catch((error) => {
  document.body.textContent = `Evaluation failed: ${String(error)}`;
});
