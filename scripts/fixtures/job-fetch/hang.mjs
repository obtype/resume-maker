/**
 * Stands in for an extractor that never answers, so the process runner's hard
 * kill can be exercised without a real board. It ignores its arguments.
 */
setTimeout(() => process.exit(0), 60_000);
