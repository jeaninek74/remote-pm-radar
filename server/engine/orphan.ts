export function runIsOrphaned({
  runningRunId,
  refreshingHere,
  lockHeldElsewhere,
}: {
  runningRunId: number | null;
  refreshingHere: boolean;
  lockHeldElsewhere: boolean;
}): boolean {
  return runningRunId !== null && !refreshingHere && !lockHeldElsewhere;
}
