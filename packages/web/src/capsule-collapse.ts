/**
 * Decides whether the top bar's capsule buttons show icon + label ("full") or
 * icon only ("compact").
 *
 * The full width is measured from a hidden copy of the full buttons, so it does
 * not change when the visible buttons collapse. A small hysteresis band keeps
 * the bar from flipping back and forth while a window is resized across the
 * threshold (and absorbs sub-pixel rounding).
 */

export const CAPSULE_HYSTERESIS_PX = 24;

export function decideCapsuleCompact(
  previousCompact: boolean,
  availableWidth: number,
  fullWidth: number,
  hysteresis = CAPSULE_HYSTERESIS_PX
): boolean {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(fullWidth) || availableWidth <= 0 || fullWidth <= 0) {
    // Nothing measured yet (e.g. hidden container): keep whatever we had.
    return previousCompact;
  }
  if (previousCompact) {
    // Only expand once the full buttons fit with room to spare.
    return availableWidth < fullWidth + hysteresis;
  }
  // Collapse as soon as the full buttons stop fitting.
  return availableWidth < fullWidth;
}
