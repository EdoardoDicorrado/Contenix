/**
 * Forecast semplice basato su:
 * - media mobile degli ultimi `windowSize` mesi
 * - trend lineare (regressione semplice)
 *
 * NON è un modello ML serio: è una stima ragionevole per dare un'idea di
 * dove va il business, sufficiente per dashboard. Mostrare sempre con
 * disclaimer all'utente.
 */

export type ForecastPoint = {
  value: number;
  /** Banda di incertezza (low/high) basata sulla volatilità storica */
  low: number;
  high: number;
};

/**
 * Calcola N punti di forecast a partire dalla serie storica.
 *
 * Algoritmo:
 * 1. Trend lineare sui dati: slope = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
 * 2. Per ogni periodo futuro: y = intercept + slope*(N+i)
 * 3. Banda di incertezza: ± deviazione standard dei residui
 */
export function forecastTimeseries(
  history: number[],
  periodsAhead: number,
  options: { windowSize?: number } = {},
): ForecastPoint[] {
  if (history.length === 0 || periodsAhead <= 0) return [];

  // Considera solo gli ultimi `windowSize` punti per il fit (più reattivo)
  const window = options.windowSize ?? Math.min(6, history.length);
  const recent = history.slice(-window);
  const n = recent.length;

  // Linear regression: y = a + b*x con x in [0, n-1]
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = recent.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * recent[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Calcola residui per la banda di incertezza
  const residuals = recent.map((v, i) => v - (intercept + slope * i));
  const meanResidual = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const variance =
    residuals.reduce((s, r) => s + (r - meanResidual) ** 2, 0) / residuals.length;
  const stdDev = Math.sqrt(variance);

  const out: ForecastPoint[] = [];
  for (let i = 1; i <= periodsAhead; i++) {
    const x = n - 1 + i;
    const value = intercept + slope * x;
    // Banda cresce con la distanza dal presente
    const widening = 1 + (i - 1) * 0.2;
    out.push({
      value: Math.max(0, value),
      low: Math.max(0, value - stdDev * widening),
      high: value + stdDev * widening,
    });
  }
  return out;
}

/**
 * Calcola il delta percentuale tra due valori (current vs previous).
 * Restituisce null se previous è 0 (per evitare divisioni invalide).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
