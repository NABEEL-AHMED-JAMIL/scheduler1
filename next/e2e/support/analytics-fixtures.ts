import { APIRequestContext, expect } from '@playwright/test';
import { api, authOf, Session } from './session';
import { hasFixtures, riverside } from './fixtures';

/**
 * The Analytics Studio's fixtures, made by the suite instead of pinned (MIG-330).
 *
 * The analytics, dashboards, data-grid, keyboard, accessibility and appearance specs used to read two objects in the
 * platform administrator's MinIO bucket (worker-store) and twenty-five dashboards that a Java seeder had written as
 * that administrator. A tenant's session can see none of it. So the suite now makes its own, in the signed-in
 * person's workspace (Riverside Health on the token path), the first time they are missing, and reuses them by name
 * afterwards:
 *
 *   <bucket>/analytics-benchmark/sales-10mb.csv   150,000 rows, the shape BenchmarkDataGeneratorIT documents
 *   <bucket>/analytics-samples/orders.csv         250,000 rows, the shape SampleDataGeneratorIT documents
 *   ten dashboards named "E2E ..."                the five benchmark reports and five of the orders catalogue
 *
 * The bucket is the workspace's object-storage connection (E2E_CONNECTION, else the rebuilt workspace's own from
 * support/fixtures.ts, else the first S3/MinIO one). Every value is a function of the row number, so a figure a spec
 * asserts is computed here, by different code from the engine that is being checked. Nothing is ever deleted: the files
 * and boards are kept for the next run (in Riverside, boards 1466-1475 and analytics-benchmark/, analytics-samples/).
 */

// ----------------------------------------------------------------------------------------------- the two datasets

export const BENCHMARK = { path: 'analytics-benchmark/sales-10mb.csv', rows: 150_000 };
export const ORDERS = { path: 'analytics-samples/orders.csv', rows: 250_000 };

const DAY_MS = 86_400_000;
const isoDay = (offset: number) => new Date(Date.UTC(2024, 0, 1) + offset * DAY_MS).toISOString().slice(0, 10);

/**
 * BenchmarkDataGeneratorIT's relation, row for row: five regions of exactly 30,000, every customer exactly three
 * times, amount 0.00..999.99 with 999.99 once, a year of dates, no nulls and no constant column.
 */
function benchmarkCsv(): Buffer {
  const regions = ['north', 'south', 'east', 'west', 'central'];
  const lines = ['id,region,customer,amount,booked_on,note'];
  for (let i = 0; i < BENCHMARK.rows; i++) {
    lines.push(`${i},${regions[i % 5]},cust-${(i * 7919) % 50000},${((i % 100000) / 100).toFixed(2)},${isoDay(i % 365)},order note ${i % 31}`);
  }
  return Buffer.from(lines.join('\n') + '\n');
}

/** A 32-bit integer mix (murmur3's finaliser), standing in for DuckDB's hash(): deterministic, and well spread. */
function mix(x: number): number {
  let h = (x ^ (x >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const CATEGORIES = ['Electronics', 'Apparel', 'Home & Garden', 'Grocery', 'Sports', 'Beauty'];
const SUBS = ['Laptops', 'Phones', 'Audio', 'Accessories', 'Menswear', 'Womenswear', 'Footwear', 'Outerwear',
  'Furniture', 'Kitchen', 'Bedding', 'Garden', 'Fresh Produce', 'Beverages', 'Snacks', 'Household',
  'Fitness', 'Outdoor', 'Team Sports', 'Cycling', 'Skincare', 'Haircare', 'Fragrance', 'Cosmetics'];
const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'International'];
const STATUSES = ['Completed', 'Shipped', 'Pending', 'Cancelled', 'Refunded'];
const CHANNELS = ['Web', 'Mobile', 'Store', 'Partner'];
const PRICE = [420.0, 48.0, 130.0, 7.5, 65.0, 24.0];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pick = (h: number, cuts: number[], mod: number) => { const v = h % mod; const at = cuts.findIndex(c => v < c); return at < 0 ? cuts.length + 1 : at + 1; };
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * SampleDataGeneratorIT's orders, with the same columns, weights and correlations: six uneven categories, six
 * weighted regions, completed dominating, Pareto-ish customers, two years (730 days, so 24 months) of dates, price by
 * category, no rating for an order that never completed. Its hash streams are this file's own, so the figures differ
 * from the platform's copy; ordersTotalRevenue() is the one a spec compares with.
 */
function ordersRows(each: (cells: (string | number)[], amountCents: number) => void): void {
  for (let n = 0; n < ORDERS.rows; n++) {
    const h = [mix(n * 2654435761 % 4294967296), mix(n * 40503 + 17), mix((n * 2246822519 + 101) % 4294967296),
      mix((n * 3266489917 + 7) % 4294967296), mix((n * 668265263 + 31) % 4294967296), mix((n * 374761393 + 53) % 4294967296)]
      .map(v => v % 1_000_000);
    const [h1, h2, h3, h4, h5, h6] = h;
    const cat = pick(h1, [22, 42, 60, 76, 90], 100);
    const sub = (h2 % 4) + 1;
    const region = pick(h3, [26, 48, 66, 82, 94], 100);
    const status = pick(h4, [702, 824, 902, 961], 1000);
    const channel = pick(h5, [45, 80, 95], 100);
    const customer = h6 % 100 < 20 ? h6 % 400 : h6 % 12000;
    const day = (h1 * 7 + h4) % 730;
    const quantity = (h2 % 5) + 1;
    const hour = 8 + (h5 % 12);
    const factor = 0.55 + (h5 % 900) / 1000;
    const unitCents = Math.round(PRICE[cat - 1] * factor * 100);
    const amountCents = Math.round(PRICE[cat - 1] * factor * quantity * 100);
    const rating = status === 3 || status === 4 ? '' : h6 % 100 < 52 ? 5 : h6 % 100 < 78 ? 4 : h6 % 100 < 90 ? 3 : h6 % 100 < 97 ? 2 : 1;
    const processing = status === 4 ? 200 + (h4 % 800) : [600, 900, 350, 2400][channel - 1] + (h4 % 2200);
    const discount = h3 % 100 < 12 ? ((h3 % 4) + 1) * 5 : 0;
    const date = isoDay(day);
    const when = new Date(Date.UTC(2024, 0, 1) + day * DAY_MS);
    each([100000 + n, `${date} ${pad(hour, 2)}:${pad(h6 % 60, 2)}:00`, date, CATEGORIES[cat - 1], SUBS[(cat - 1) * 4 + sub - 1],
      REGIONS[region - 1], STATUSES[status - 1], CHANNELS[channel - 1], `CUST-${pad(customer, 5)}`,
      `${CATEGORIES[cat - 1]}-${pad((h3 % 40) + 1, 3)}`, quantity, (unitCents / 100).toFixed(2), (amountCents / 100).toFixed(2),
      rating, processing, discount, date.slice(0, 7), when.getUTCFullYear(), `Q${Math.floor(when.getUTCMonth() / 3) + 1}`,
      WEEKDAYS[when.getUTCDay()], hour], amountCents);
  }
}

function ordersCsv(): Buffer {
  const lines = ['order_id,ordered_at,order_date,category,sub_category,region,status,channel,customer_id,product_sku,'
    + 'quantity,unit_price,amount,rating,processing_ms,discount_pct,order_month,order_year,order_quarter,order_weekday,order_hour'];
  ordersRows(cells => lines.push(cells.map(c => (typeof c === 'string' && c.includes(',') ? `"${c}"` : String(c))).join(',')));
  return Buffer.from(lines.join('\n') + '\n');
}

/** SUM(amount) over every order, as the console prints it: "103,909,527.58"-style, exact to the cent. */
export function ordersTotalRevenue(): string {
  let cents = 0;
  ordersRows((_, amount) => { cents += amount; });
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --------------------------------------------------------------------------------------------- the ten dashboards

type Measure = { aggregation: string; field?: string };
interface Widget { title: string; chart: string; config: Record<string, unknown>; }
interface Report { name: string; description: string; dataset: string; widgets: Widget[]; }

const measure = (aggregation: string, field?: string): Measure => (field ? { aggregation, field } : { aggregation });
const clause = (field: string, operator: string, value?: string) => (value === undefined ? { field, operator } : { field, operator, value });
function analysis(dimensions: string[], m: Measure, filters?: unknown, topN?: number, by = 'MEASURE', direction = 'DESC') {
  return { dimensions, measure: m, ...(filters ? { filters } : {}), ...(topN ? { topN: { limit: topN, includeOther: true } } : {}),
    sort: { by, direction } };
}
const w = (title: string, chart: string, config: Record<string, unknown>): Widget => ({ title, chart, config });

/** The prefix every dashboard (and every saved analysis behind one) this file writes carries. */
export const PREFIX = 'E2E ';
export const boardName = (name: string) => `${PREFIX}${name}`;

function reports(): Report[] {
  const B = BENCHMARK.path;
  const O = ORDERS.path;
  const region = ['region'], customer = ['customer'], date = ['booked_on'], whole: string[] = [];
  const high = clause('amount', 'GT', '900'), low = clause('amount', 'LT', '100'), note = clause('note', 'IS_NOT_NULL');
  const sub = ['sub_category'], cat = ['category'], month = ['order_month'], quarter = ['order_quarter'];
  const catRegion = ['category', 'region'], regionChannel = ['region', 'channel'];
  return [
    { name: 'Sales by region', dataset: B, description: 'Where the money comes from, six ways over the same five regions.', widgets: [
      w('Revenue by region', 'bar', analysis(region, measure('SUM', 'amount'))),
      w('Orders by region', 'donut', analysis(region, measure('COUNT_ROWS'))),
      w('Average order value by region', 'ranked', analysis(region, measure('AVERAGE', 'amount'))),
      w('Median order value by region', 'bar', analysis(region, measure('MEDIAN', 'amount'))),
      w('Largest order by region', 'table', analysis(region, measure('MAXIMUM', 'amount'))),
      w('Smallest order by region', 'table', analysis(region, measure('MINIMUM', 'amount')))] },
    { name: 'Customer performance', dataset: B, description: 'Who buys, how often, and how much -- capped at the top ten.', widgets: [
      w('Top 10 customers by revenue', 'ranked', analysis(customer, measure('SUM', 'amount'), null, 10)),
      w('Top 10 customers by order count', 'ranked', analysis(customer, measure('COUNT_ROWS'), null, 10)),
      w('Top 10 customers by average order', 'bar', analysis(customer, measure('AVERAGE', 'amount'), null, 10)),
      w('How many customers there are', 'table', analysis(whole, measure('DISTINCT_COUNT', 'customer'))),
      w('Customers per region', 'bar', analysis(region, measure('DISTINCT_COUNT', 'customer')))] },
    { name: 'Booking activity', dataset: B, description: 'What the order book looks like over time.', widgets: [
      w('Revenue by booking date', 'bar', analysis(date, measure('SUM', 'amount'), null, 20)),
      w('Orders by booking date', 'bar', analysis(date, measure('COUNT_ROWS'), null, 20)),
      w('Average order value by date', 'ranked', analysis(date, measure('AVERAGE', 'amount'), null, 20)),
      w('Busiest booking dates', 'ranked', analysis(date, measure('MAXIMUM', 'amount'), null, 20)),
      w('Customers active per date', 'bar', analysis(date, measure('DISTINCT_COUNT', 'customer'), null, 20))] },
    { name: 'Revenue quality', dataset: B, description: 'The very large, the very small, and the incomplete.', widgets: [
      w('High-value revenue by region (over 900)', 'bar', analysis(region, measure('SUM', 'amount'), high)),
      w('High-value order count by region', 'donut', analysis(region, measure('COUNT_ROWS'), high)),
      w('Low-value order count by region (under 100)', 'bar', analysis(region, measure('COUNT_ROWS'), low)),
      w('Top customers among high-value orders', 'ranked', analysis(customer, measure('SUM', 'amount'), high, 10)),
      w('Orders carrying a note, by region', 'table', analysis(region, measure('COUNT_ROWS'), note))] },
    { name: 'Executive summary', dataset: B, description: 'Six numbers for somebody who has ninety seconds.', widgets: [
      w('Total revenue', 'table', analysis(whole, measure('SUM', 'amount'))),
      w('Total orders', 'table', analysis(whole, measure('COUNT_ROWS'))),
      w('Average order value', 'table', analysis(whole, measure('AVERAGE', 'amount'))),
      w('Distinct customers', 'table', analysis(whole, measure('DISTINCT_COUNT', 'customer'))),
      w('Revenue by region', 'donut', analysis(region, measure('SUM', 'amount'))),
      w('Top 5 customers', 'ranked', analysis(customer, measure('SUM', 'amount'), null, 5))] },
    { name: '01 Overall KPI summary', dataset: O, description: 'The whole file in six numbers.', widgets: [
      w('Total revenue', 'table', analysis(whole, measure('SUM', 'amount'))),
      w('Total orders', 'table', analysis(whole, measure('COUNT_ROWS'))),
      w('Average order value', 'table', analysis(whole, measure('AVERAGE', 'amount'))),
      w('Distinct customers', 'table', analysis(whole, measure('DISTINCT_COUNT', 'customer_id'))),
      w('Average rating', 'table', analysis(whole, measure('AVERAGE', 'rating'))),
      w('Average processing time (ms)', 'table', analysis(whole, measure('AVERAGE', 'processing_ms')))] },
    { name: '03 Monthly trend', dataset: O, description: 'The order book folded to months.', widgets: [
      w('Revenue by month', 'bar', analysis(month, measure('SUM', 'amount'), null, 24, 'DIMENSION', 'ASC')),
      w('Orders by month', 'bar', analysis(month, measure('COUNT_ROWS'), null, 24, 'DIMENSION', 'ASC')),
      w('Average order value by month', 'bar', analysis(month, measure('AVERAGE', 'amount'), null, 24, 'DIMENSION', 'ASC')),
      w('Completed revenue by month', 'bar', analysis(month, measure('SUM', 'amount'), clause('status', 'EQ', 'Completed'), 24, 'DIMENSION', 'ASC')),
      w('Revenue by quarter', 'donut', analysis(quarter, measure('SUM', 'amount'), null, undefined, 'DIMENSION', 'ASC'))] },
    { name: '04 Category distribution', dataset: O, description: 'Six categories on value and on volume.', widgets: [
      w('Revenue share by category', 'donut', analysis(cat, measure('SUM', 'amount'))),
      w('Order share by category', 'donut', analysis(cat, measure('COUNT_ROWS'))),
      w('Average order value by category', 'ranked', analysis(cat, measure('AVERAGE', 'amount'))),
      w('Units sold by category', 'bar', analysis(cat, measure('SUM', 'quantity'))),
      w('Customers reached by category', 'bar', analysis(cat, measure('DISTINCT_COUNT', 'customer_id')))] },
    { name: '05 Top 10 sub-categories', dataset: O, description: 'The leaders out of twenty-four.', widgets: [
      w('Top 10 by revenue', 'ranked', analysis(sub, measure('SUM', 'amount'), null, 10)),
      w('Top 10 by order count', 'ranked', analysis(sub, measure('COUNT_ROWS'), null, 10)),
      w('Top 10 by units sold', 'ranked', analysis(sub, measure('SUM', 'quantity'), null, 10)),
      w('Top 10 by average order value', 'ranked', analysis(sub, measure('AVERAGE', 'amount'), null, 10)),
      w('Top 10 by customers reached', 'ranked', analysis(sub, measure('DISTINCT_COUNT', 'customer_id'), null, 10))] },
    { name: '07 Category against region', dataset: O, description: 'Two dimensions at once.', widgets: [
      w('Revenue by category and region', 'table', analysis(catRegion, measure('SUM', 'amount'))),
      w('Orders by category and region', 'table', analysis(catRegion, measure('COUNT_ROWS'))),
      w('Average order value by category and region', 'table', analysis(catRegion, measure('AVERAGE', 'amount'))),
      w('Revenue by region and channel', 'table', analysis(regionChannel, measure('SUM', 'amount'))),
      w('Units by category and region', 'table', analysis(catRegion, measure('SUM', 'quantity')))] },
  ];
}

// ------------------------------------------------------------------------------------------------ find or create

export interface AnalyticsFixtures { connection: string; }

let ready: Promise<AnalyticsFixtures> | null = null;

/** Finds the fixtures, making whatever is missing. Once per worker; cheap after the first run (a few reads). */
export function analyticsFixtures(request: APIRequestContext, s: Session): Promise<AnalyticsFixtures> {
  ready ??= build(request, s).catch(error => { ready = null; throw error; });
  return ready;
}

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<any> {
  return response.json().catch(() => ({}));
}

async function connectionOf(request: APIRequestContext, s: Session): Promise<string> {
  const named = process.env['E2E_CONNECTION'];
  if (named) return named;
  const buckets: { bucket: string; provider?: string }[] = (await json(await request.get(`${api}/storage.json/buckets`, { headers: authOf(s) }))).data ?? [];
  const aliases = buckets.map(b => b.bucket);
  const own = hasFixtures() ? riverside().storageAlias : undefined;
  const chosen = (own && aliases.includes(own) ? own : undefined)
    ?? buckets.find(b => /^(S3|MINIO)$/i.test(b.provider ?? ''))?.bucket;
  expect(chosen, 'the workspace has an object-storage connection for the analytics fixtures').toBeTruthy();
  return chosen!;
}

async function ensureObject(request: APIRequestContext, s: Session, bucket: string, key: string, make: () => Buffer): Promise<void> {
  const meta = await json(await request.get(`${api}/storage.json/objectMetadata`, { headers: authOf(s), params: { bucket, key } }));
  const body = make();
  if (meta.status === 'SUCCESS' && Number(meta.data?.size) === body.length) return;
  const slash = key.lastIndexOf('/');
  const upload = await json(await request.post(`${api}/storage.json/uploadObject`, { headers: authOf(s), timeout: 300_000, multipart: {
    bucket, prefix: key.slice(0, slash + 1), file: { name: key.slice(slash + 1), mimeType: 'text/csv', buffer: body } } }));
  expect(upload.status, `upload ${bucket}/${key}: ${upload.message}`).toBe('SUCCESS');
}

async function post(request: APIRequestContext, s: Session, path: string, data: unknown): Promise<any> {
  const answer = await json(await request.post(`${api}/analyticsWorkspace.json/${path}`, { headers: authOf(s), data }));
  expect(answer.status, `${path}: ${answer.message}`).toBe('SUCCESS');
  return answer.data;
}

async function ensureBoard(request: APIRequestContext, s: Session, connection: string, report: Report,
  existing: { analyticsDashboardId: number; dashboardName: string }[]): Promise<void> {
  const name = boardName(report.name);
  let id = existing.find(d => d.dashboardName === name)?.analyticsDashboardId;
  let have: string[] = [];
  if (id) {
    const board = await json(await request.get(`${api}/analyticsWorkspace.json/fetchDashboardById`,
      { headers: authOf(s), params: { analyticsDashboardId: id } }));
    have = (board.data?.widgets ?? []).map((x: { widgetTitle: string }) => x.widgetTitle);
  } else {
    id = (await post(request, s, 'saveDashboard', { dashboardName: name, dashboardDescription: `${report.description} (made by the e2e suite)` }))
      .analyticsDashboardId;
  }
  // A board a run left half-built gets the widgets it is missing, in order, rather than a twin.
  for (const [order, widget] of report.widgets.entries()) {
    if (have.includes(widget.title)) continue;
    const analysisId = (await post(request, s, 'saveAnalysis', { analysisName: `${PREFIX}${widget.title}`, connectionAlias: connection,
      datasetPath: report.dataset, visualizationType: widget.chart, analysisConfig: JSON.stringify(widget.config) })).analyticsAnalysisId;
    await post(request, s, 'saveWidget', { analyticsDashboardId: id, analyticsAnalysisId: analysisId, widgetTitle: widget.title,
      visualizationType: widget.chart, displayOrder: order });
  }
}

async function build(request: APIRequestContext, s: Session): Promise<AnalyticsFixtures> {
  const connection = await connectionOf(request, s);
  await ensureObject(request, s, connection, BENCHMARK.path, benchmarkCsv);
  await ensureObject(request, s, connection, ORDERS.path, ordersCsv);
  const existing = (await json(await request.get(`${api}/analyticsWorkspace.json/fetchAllDashboards`, { headers: authOf(s) }))).data ?? [];
  for (const report of reports()) await ensureBoard(request, s, connection, report, existing);
  return { connection };
}
