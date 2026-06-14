<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as echarts from "echarts/core";
  import { BarChart, LineChart } from "echarts/charts";
  import {
    GridComponent,
    LegendComponent,
    TitleComponent,
    TooltipComponent,
    type GridComponentOption,
    type LegendComponentOption,
    type TitleComponentOption,
    type TooltipComponentOption,
  } from "echarts/components";
  import { CanvasRenderer } from "echarts/renderers";
  import type { ComposeOption } from "echarts/core";
  import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
  import { currentLocale, getT } from "@/i18n";

  echarts.use([
    BarChart,
    LineChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    CanvasRenderer,
  ]);

  type ChartOption = ComposeOption<
    | GridComponentOption
    | TooltipComponentOption
    | LegendComponentOption
    | TitleComponentOption
    | BarSeriesOption
    | LineSeriesOption
  >;

  interface CountItem {
    name: string;
    count: number;
  }

  interface MonthlyPostCount {
    label: string;
    count: number;
  }

  interface Props {
    monthlyPostCounts: MonthlyPostCount[];
    categoryCounts: CountItem[];
    tagCounts: CountItem[];
  }

  const {
    monthlyPostCounts = [],
    categoryCounts = [],
    tagCounts = [],
  }: Props = $props();

  const t = getT(currentLocale);

  let monthlyChartElement = $state<HTMLDivElement | null>(null);
  let categoryChartElement = $state<HTMLDivElement | null>(null);
  let tagChartElement = $state<HTMLDivElement | null>(null);

  let monthlyChart: echarts.ECharts | null = null;
  let categoryChart: echarts.ECharts | null = null;
  let tagChart: echarts.ECharts | null = null;

  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;

  /**
   * 将主题 token 解析为实际颜色值，避免 Canvas 图表无法正确解析 CSS 变量而回退为黑色。
   */
  function resolveThemeColor(token: string): string {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return token;
    }
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || token;
  }

  function createMonthlyOption(): ChartOption {
    const lineColor = resolveThemeColor("--color-purple");
    const pointColor = resolveThemeColor("--color-red");
    const titleColor = resolveThemeColor("--color-purple");
    const xAxisColor = resolveThemeColor("--color-aqua");
    const yAxisColor = resolveThemeColor("--color-purple");
    return {
      title: {
        text: t("statistics.monthlyPosts"),
        left: "center",
        textStyle: {
          color: titleColor,
          fontWeight: 600,
          fontSize: 16,
        },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "color-mix(in srgb, var(--grey-1) 94%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-purple) 30%, var(--grey-4))",
        textStyle: {
          color: "var(--grey-7)",
        },
      },
      grid: {
        left: 36,
        right: 24,
        top: 56,
        bottom: 28,
      },
      xAxis: {
        type: "category",
        data: monthlyPostCounts.map((item) => item.label),
        axisLabel: {
          color: xAxisColor,
          rotate: monthlyPostCounts.length > 10 ? 35 : 0,
        },
        axisLine: {
          lineStyle: {
            color: "var(--grey-4)",
          },
        },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: {
          color: yAxisColor,
        },
        splitLine: {
          lineStyle: {
            color: "var(--grey-3)",
          },
        },
      },
      series: [
        {
          name: t("statistics.postCount"),
          type: "line",
          smooth: true,
          data: monthlyPostCounts.map((item) => item.count),
          lineStyle: {
            width: 3,
            color: lineColor,
          },
          itemStyle: {
            color: pointColor,
            opacity: 1,
          },
          areaStyle: {
            color:
              "color-mix(in srgb, var(--color-purple) 26%, var(--color-pink) 18%)",
            opacity: 1,
          },
          emphasis: {
            focus: "none",
            itemStyle: {
              opacity: 1,
            },
            lineStyle: {
              opacity: 1,
            },
            areaStyle: {
              opacity: 1,
            },
          },
          blur: {
            itemStyle: {
              opacity: 1,
            },
            lineStyle: {
              opacity: 1,
            },
            areaStyle: {
              opacity: 1,
            },
          },
        },
      ],
    };
  }

  function createCategoryOption(): ChartOption {
    const topCategories = categoryCounts.slice(0, 10);
    const palette = [
      resolveThemeColor("--color-red"),
      resolveThemeColor("--color-orange"),
      resolveThemeColor("--color-yellow"),
      resolveThemeColor("--color-pink"),
      resolveThemeColor("--color-purple"),
      resolveThemeColor("--color-blue"),
      resolveThemeColor("--color-aqua"),
      resolveThemeColor("--color-green"),
    ];
    const titleColor = resolveThemeColor("--color-red");
    const xAxisColor = resolveThemeColor("--color-orange");
    const yAxisColor = resolveThemeColor("--color-pink");
    return {
      color: palette,
      title: {
        text: t("statistics.categoryDistribution"),
        left: "center",
        textStyle: {
          color: titleColor,
          fontWeight: 600,
          fontSize: 16,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        backgroundColor: "color-mix(in srgb, var(--grey-1) 94%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-orange) 34%, var(--grey-4))",
        textStyle: {
          color: "var(--grey-7)",
        },
      },
      grid: {
        left: 56,
        right: 16,
        top: 56,
        bottom: 22,
      },
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: {
          color: xAxisColor,
        },
        splitLine: {
          lineStyle: {
            color: "var(--grey-3)",
          },
        },
      },
      yAxis: {
        type: "category",
        data: topCategories.map((item) => item.name),
        axisLabel: {
          color: yAxisColor,
        },
        axisLine: {
          lineStyle: {
            color: "var(--grey-4)",
          },
        },
      },
      series: [
        {
          name: t("statistics.postCount"),
          type: "bar",
          data: topCategories.map((item) => item.count),
          barWidth: "52%",
          colorBy: "data",
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            opacity: 1,
          },
          emphasis: {
            focus: "none",
            itemStyle: {
              opacity: 1,
            },
          },
          blur: {
            itemStyle: {
              opacity: 1,
            },
          },
        },
      ],
    };
  }

  function createTagOption(): ChartOption {
    const topTags = tagCounts.slice(0, 16);
    const palette = [
      resolveThemeColor("--color-blue"),
      resolveThemeColor("--color-aqua"),
      resolveThemeColor("--color-green"),
      resolveThemeColor("--color-yellow"),
      resolveThemeColor("--color-orange"),
      resolveThemeColor("--color-red"),
      resolveThemeColor("--color-pink"),
      resolveThemeColor("--color-purple"),
    ];
    const titleColor = resolveThemeColor("--color-blue");
    const xAxisColor = resolveThemeColor("--color-aqua");
    const yAxisColor = resolveThemeColor("--color-blue");
    return {
      color: palette,
      title: {
        text: t("statistics.tagDistribution"),
        left: "center",
        textStyle: {
          color: titleColor,
          fontWeight: 600,
          fontSize: 16,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        backgroundColor: "color-mix(in srgb, var(--grey-1) 94%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-blue) 34%, var(--grey-4))",
        textStyle: {
          color: "var(--grey-7)",
        },
      },
      grid: {
        left: 28,
        right: 24,
        top: 56,
        bottom: 36,
      },
      xAxis: {
        type: "category",
        data: topTags.map((item) => item.name),
        axisLabel: {
          color: xAxisColor,
          rotate: topTags.length > 8 ? 28 : 0,
        },
        axisLine: {
          lineStyle: {
            color: "var(--grey-4)",
          },
        },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: {
          color: yAxisColor,
        },
        splitLine: {
          lineStyle: {
            color: "var(--grey-3)",
          },
        },
      },
      series: [
        {
          name: t("statistics.postCount"),
          type: "bar",
          data: topTags.map((item) => item.count),
          barWidth: "56%",
          colorBy: "data",
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            opacity: 1,
          },
          emphasis: {
            focus: "none",
            itemStyle: {
              opacity: 1,
            },
          },
          blur: {
            itemStyle: {
              opacity: 1,
            },
          },
        },
      ],
    };
  }

  function renderCharts() {
    if (monthlyChartElement) {
      monthlyChart = echarts.init(monthlyChartElement);
      monthlyChart.setOption(createMonthlyOption());
    }

    if (categoryChartElement) {
      categoryChart = echarts.init(categoryChartElement);
      categoryChart.setOption(createCategoryOption());
    }

    if (tagChartElement) {
      tagChart = echarts.init(tagChartElement);
      tagChart.setOption(createTagOption());
    }
  }

  function refreshChartOptions() {
    monthlyChart?.setOption(createMonthlyOption(), { notMerge: true });
    categoryChart?.setOption(createCategoryOption(), { notMerge: true });
    tagChart?.setOption(createTagOption(), { notMerge: true });
  }

  function bindResizeObserver() {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      monthlyChart?.resize();
      categoryChart?.resize();
      tagChart?.resize();
    });

    if (monthlyChartElement) {
      resizeObserver.observe(monthlyChartElement);
    }
    if (categoryChartElement) {
      resizeObserver.observe(categoryChartElement);
    }
    if (tagChartElement) {
      resizeObserver.observe(tagChartElement);
    }
  }

  onMount(() => {
    renderCharts();
    bindResizeObserver();

    if (typeof MutationObserver !== "undefined") {
      themeObserver = new MutationObserver((mutations) => {
        const themeChanged = mutations.some((mutation) => mutation.attributeName === "data-theme");
        if (themeChanged) {
          refreshChartOptions();
        }
      });

      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    themeObserver?.disconnect();

    monthlyChart?.dispose();
    categoryChart?.dispose();
    tagChart?.dispose();

    monthlyChart = null;
    categoryChart = null;
    tagChart = null;
  });
</script>

<section class="chart-section">
  <div class="chart-card">
    <div bind:this={monthlyChartElement} class="chart-canvas"></div>
  </div>

  <div class="chart-grid">
    <div class="chart-card">
      <div bind:this={categoryChartElement} class="chart-canvas"></div>
    </div>
    <div class="chart-card">
      <div bind:this={tagChartElement} class="chart-canvas"></div>
    </div>
  </div>
</section>

<style>
  .chart-section {
    display: grid;
    gap: 1rem;
  }

  .chart-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .chart-card {
    border: 1px solid color-mix(in srgb, var(--grey-4) 24%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--grey-1) 94%, transparent);
    box-shadow: var(--shadow-card-soft);
    padding: 0.25rem;
  }

  .chart-canvas {
    width: 100%;
    min-height: 21rem;
  }

  @media (min-width: 64rem) {
    .chart-grid {
      grid-template-columns: 1fr 1fr;
    }

    .chart-canvas {
      min-height: 22rem;
    }
  }
</style>
