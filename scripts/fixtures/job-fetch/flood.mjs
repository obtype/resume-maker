/**
 * Stands in for an extractor that writes far more than the route accepts, so
 * the stdout cap is exercised without a real board. It ignores its arguments.
 */
process.stdout.write("x".repeat(200_000));
