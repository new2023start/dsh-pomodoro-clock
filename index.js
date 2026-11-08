/**
 * dsh-pomodoro-clock — host side.
 *
 * The pomodoro timer lives entirely in the browser: the right sidebar is a
 * client surface, so the timer state, its persistence and its alarm all run
 * in the page. The host plugin therefore only exists to give the bundle a row
 * in the profile patch (`cordis.patch.yml`) and a place to hang host-owned
 * configuration later on.
 *
 * Per-phase lengths are edited by the user inside the panel itself and are
 * stored in the browser, so they deliberately stay out of the host `Config`:
 * the host cannot reach the page without a route, and a value the user changes
 * every day belongs next to the timer it drives.
 */

export const name = "dsh-pomodoro-clock";

/**
 * Host plugin entry point.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx host context
 */
export function apply(ctx) {
  ctx.effect(() => () => {}, "dsh-pomodoro: host placeholder");
}
