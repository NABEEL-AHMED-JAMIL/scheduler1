/**
 * ECharts, assembled from the parts the console uses and nothing else.
 *
 * Imported ONLY through loadECharts() (echart-runtime.ts), with a dynamic import, so the bundler
 * puts all of it in its own chunk: no page pays for ECharts until a chart drawn by it scrolls into
 * view. The initial bundle must not grow by a byte for this -- it is over budget already.
 *
 * `echarts/core` plus the chart types, components and renderers below, rather than `echarts`,
 * which would bring every chart, the map and geo machinery, and both renderers' extras. A kind
 * added to chart-options.ts that needs a series or component not listed here draws nothing and
 * logs a "not imported" warning, which is the cue to add it here.
 *
 * @author Nabeel Ahmed
 */
import * as echarts from 'echarts/core';
import {
  BarChart, BoxplotChart, CandlestickChart, ChordChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart,
  LineChart, ParallelChart, PictorialBarChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart,
  ThemeRiverChart, TreeChart, TreemapChart,
} from 'echarts/charts';
import {
  AriaComponent, CalendarComponent, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent,
  MarkPointComponent, ParallelComponent, PolarComponent, RadarComponent, SingleAxisComponent, TitleComponent,
  ToolboxComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, BoxplotChart, CandlestickChart, ChordChart, EffectScatterChart, FunnelChart, GaugeChart, HeatmapChart,
  LineChart, ParallelChart, PictorialBarChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart,
  ThemeRiverChart, TreeChart, TreemapChart,
  AriaComponent, CalendarComponent, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent,
  MarkPointComponent, ParallelComponent, PolarComponent, RadarComponent, SingleAxisComponent, TitleComponent,
  ToolboxComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, CanvasRenderer, SVGRenderer,
]);

export { echarts };
