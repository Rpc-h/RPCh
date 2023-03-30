import Prometheus from "prom-client";
import { METRIC_PREFIX } from "../constants";

export const createCounter = (
  register: Prometheus.Registry,
  name: string,
  help: string,
  config?: {
    [key in keyof Omit<
      Prometheus.CounterConfiguration<string>,
      "name" | "help"
    >]: Prometheus.CounterConfiguration<string>[key] | undefined;
  }
) => {
  return new Prometheus.Counter({
    name: METRIC_PREFIX + name,
    help,
    registers: [register],
    ...config,
  });
};

export const createGauge = (
  register: Prometheus.Registry,
  name: string,
  help: string,
  config?: Prometheus.GaugeConfiguration<string>
) => {
  return new Prometheus.Gauge({
    name: METRIC_PREFIX + name,
    help,
    registers: [register],
    ...config,
  });
};

export const createHistogram = (
  register: Prometheus.Registry,
  name: string,
  help: string,
  config?: {
    [key in keyof Omit<
      Prometheus.HistogramConfiguration<string>,
      "name" | "help"
    >]: Prometheus.HistogramConfiguration<string>[key] | undefined;
  }
) => {
  return new Prometheus.Histogram({
    name: METRIC_PREFIX + name,
    help,
    registers: [register],
    ...config,
  });
};

export const createSummary = (
  register: Prometheus.Registry,
  name: string,
  help: string,
  config?: Prometheus.SummaryConfiguration<string>
) => {
  return new Prometheus.Summary({
    name: METRIC_PREFIX + name,
    help,
    registers: [register],
    ...config,
  });
};