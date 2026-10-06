/**
 * The one door to ECharts: a dynamic import, made once and shared.
 *
 * Every app-echart on a board asks here; the first request starts the download of the chunk and
 * the rest wait on the same promise, so twelve tiles fetch it once.
 *
 * @author Nabeel Ahmed
 */
export type EChartsModule = typeof import('./echart-setup');

let loading: Promise<EChartsModule> | null = null;

export function loadECharts(): Promise<EChartsModule> {
  loading ??= import('./echart-setup').catch(error => {
    // A failed chunk load (a deploy replaced it mid-visit) is retried by the next chart, not cached.
    loading = null;
    throw error;
  });
  return loading;
}
