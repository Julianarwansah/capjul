// Shared by the clip and audio inspectors. Kept out of controls.tsx because a
// file that exports both components and constants breaks React Fast Refresh.

/** Quick-pick playback rates offered beside the speed slider. */
export const SPEED_PRESETS = [0.3, 0.5, 1, 1.5, 2, 4]
