/**
 * Feature flags for controlling feature visibility at launch.
 *
 * TASKS_ENABLED: When false, task-related UI is hidden (settings toggle,
 * regen modal toggle). Tasks are still extracted by the AI and stored in
 * note metadata — this only controls visibility. Flip to true when ready
 * to launch the Tasks feature publicly.
 */
export const TASKS_ENABLED = false
