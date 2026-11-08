type PostedDateSortFields = {
  postedAt?: string | null;
  firstSeenAt?: string | null;
};

function descendingNullsLast(left: string | null | undefined, right: string | null | undefined): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  return right.localeCompare(left);
}

export function compareJobsByPostedDate(a: PostedDateSortFields, b: PostedDateSortFields): number {
  return descendingNullsLast(a.postedAt, b.postedAt)
    || descendingNullsLast(a.firstSeenAt, b.firstSeenAt);
}
