export function reloadIfBuildChanged(
  previous: string | null,
  next: string | null | undefined,
  interactionBlocked: boolean,
  reload: () => void,
): boolean {
  if (previous === null || !next || previous === next || interactionBlocked) return false;
  reload();
  return true;
}
