const LATITUDE = parseFloat(process.env.WEATHER_LATITUDE || "51.5014");
const LONGITUDE = parseFloat(process.env.WEATHER_LONGITUDE || "-0.1419");
const OPEN_METEO_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&hourly=temperature_2m,weathercode&timezone=Europe/London&forecast_days=1`;

export interface HourlyForecast {
  time: Date;
  temperature: number;
  weatherCode: number;
  weatherDescription: string;
}

export interface WeatherData {
  current: HourlyForecast | null;
  forecast: HourlyForecast[];
  lastUpdated: Date;
  error: string | null;
}

// WMO Weather codes to descriptions
const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Light snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export function getWeatherDescription(code: number): string {
  return WEATHER_CODES[code] || "Unknown";
}

export function getWeatherIcon(code: number): string {
  if (code === 0) return "sun";
  if (code <= 2) return "cloud-sun";
  if (code <= 3) return "cloud";
  if (code <= 48) return "cloud"; // fog
  if (code <= 67) return "cloud-rain";
  if (code <= 77) return "snowflake";
  if (code <= 82) return "cloud-rain";
  if (code <= 86) return "cloud-snow";
  return "cloud-lightning";
}

export async function fetchWeather(): Promise<WeatherData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(OPEN_METEO_URL, {
      next: { revalidate: 300 },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();

    const times: string[] = data.hourly?.time || [];
    const temps: number[] = data.hourly?.temperature_2m || [];
    const codes: number[] = data.hourly?.weathercode || [];

    const now = new Date();
    const currentHour = now.getHours();

    // Find current hour and next 3 hours
    const forecasts: HourlyForecast[] = [];
    for (let i = 0; i < times.length && forecasts.length < 4; i++) {
      const time = new Date(times[i]);
      if (time.getHours() >= currentHour) {
        forecasts.push({
          time,
          temperature: Math.round(temps[i]),
          weatherCode: codes[i],
          weatherDescription: getWeatherDescription(codes[i]),
        });
      }
    }

    return {
      current: forecasts[0] || null,
      forecast: forecasts.slice(1, 4),
      lastUpdated: new Date(),
      error: null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage =
      error instanceof Error && error.name === "AbortError"
        ? "Request timeout"
        : error instanceof Error
          ? error.message
          : "Unknown error";

    return {
      current: null,
      forecast: [],
      lastUpdated: new Date(),
      error: errorMessage,
    };
  }
}

export function formatHour(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
