export interface BusArrival {
  id: string;
  lineName: string;
  destinationName: string;
  timeToStation: number;
  expectedArrival: string;
}

export interface TflData {
  arrivals: BusArrival[];
  lastUpdated: Date;
  isStale: boolean;
  error: string | null;
}

// Cache TTL matches RENDER_INTERVAL in start.sh and REFRESH_INTERVAL in KOReader plugin
// This ensures all pages in a render batch use the same data
const CACHE_TTL_MS = 30000; // 30 seconds - aligned with refresh cycle
const cache = new Map<string, { data: TflData; timestamp: number }>();

export async function fetchBusArrivals(
  stopId: string,
  busLine: string
): Promise<TflData> {
  const cacheKey = `${stopId}-${busLine}`;
  const now = Date.now();

  // Return cached data if within TTL
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  // Use Line endpoint - more reliable than StopPoint endpoint for some stops
  const apiUrl = `https://api.tfl.gov.uk/Line/${busLine}/Arrivals/${stopId}`;

  try {
    const response = await fetch(apiUrl, {
      next: { revalidate: 30 },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TFL API error: ${response.status}`);
    }

    const data: BusArrival[] = await response.json();

    clearTimeout(timeoutId);

    // Line endpoint already filters by line, just sort and limit
    const filteredArrivals = data
      .sort((a, b) => a.timeToStation - b.timeToStation)
      .slice(0, 10);

    const result: TflData = {
      arrivals: filteredArrivals,
      lastUpdated: new Date(),
      isStale: false,
      error: null,
    };

    // Cache for subsequent page renders
    cache.set(cacheKey, { data: result, timestamp: now });

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage =
      error instanceof Error && error.name === "AbortError"
        ? "Request timeout"
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return {
      arrivals: [],
      lastUpdated: new Date(),
      isStale: true,
      error: errorMessage,
    };
  }
}

// Backward-compatible wrapper using env vars (for legacy single-stop configs)
export async function fetchW7Arrivals(): Promise<TflData> {
  const stopId = process.env.STOP_1_ID || process.env.STOP_ID || "490000118P";
  const busLine = process.env.STOP_1_BUS_LINE || process.env.BUS_LINE || "9";
  return fetchBusArrivals(stopId, busLine);
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return "Due";
  if (minutes === 1) return "1 min";
  return `${minutes} mins`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface LeaveTimeInfo {
  leaveInSeconds: number;
  leaveTime: Date;
  isLeaveNow: boolean;
}

export function calculateLeaveTime(
  busArrivalSeconds: number,
  walkMinutes: number = 5
): LeaveTimeInfo {
  const walkSeconds = walkMinutes * 60;
  const leaveInSeconds = busArrivalSeconds - walkSeconds;
  const leaveTime = new Date(Date.now() + leaveInSeconds * 1000);
  const isLeaveNow = leaveInSeconds <= 60;

  return { leaveInSeconds, leaveTime, isLeaveNow };
}
