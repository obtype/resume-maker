import { deliverableHasContent } from "./schema";
import { normalizeSelection } from "./normalize";
import {
  DELIVERABLE_IDS,
  type DeliverableContentSource,
  type DeliverableId,
} from "./types";

/**
 * Toggles one deliverable while keeping the canonical order. The selection is
 * never allowed to become empty: unchecking the last remaining deliverable is a
 * no-op.
 */
export function toggleDeliverableSelection(
  selected: readonly DeliverableId[],
  id: DeliverableId,
  checked: boolean,
): DeliverableId[] {
  const current = normalizeSelection(selected);

  if (checked) {
    if (current.includes(id)) return current;
    return DELIVERABLE_IDS.filter((item) => item === id || current.includes(item));
  }

  if (!current.includes(id)) return current;
  if (current.length === 1) return current;
  return current.filter((item) => item !== id);
}

/** Deliverables that do not have generated content yet, in canonical order. */
export function missingDeliverableIds(
  source: DeliverableContentSource,
): DeliverableId[] {
  return DELIVERABLE_IDS.filter((id) => !deliverableHasContent(source, id));
}

/**
 * Selects exactly the deliverables that have no content, so the user can
 * regenerate only the missing parts. When everything already has content the
 * current selection is kept, which also guarantees a non-empty result.
 */
export function selectMissingDeliverables(
  source: DeliverableContentSource,
  selected: readonly DeliverableId[],
): DeliverableId[] {
  const missing = missingDeliverableIds(source);
  if (missing.length > 0) return missing;
  return normalizeSelection(selected);
}
