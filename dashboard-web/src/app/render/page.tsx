import {
  fetchBusArrivals,
  formatMinutes,
  formatTime,
  formatTimeShort,
  calculateLeaveTime,
  LeaveTimeInfo,
} from "@/lib/tfl";
import { fetchWeather, getWeatherIcon } from "@/lib/weather";
import { ArrowRight, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun, Snowflake } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Colors
const TFL_BLUE = "#000F9F";
const DARK_BG = "#1a1a1a";
const WHITE_BG = "#FFFFFF";
const BORDER_RADIUS = "24px";
const INNER_BORDER_RADIUS = "12px";

// P22 Underground / Johnston font stack
const FONT_FAMILY = "'P22 Underground', 'P22 Johnston Underground', 'New Johnston', 'Johnston ITC', var(--font-hammersmith), 'Hammersmith One', system-ui, sans-serif";

// Stop configuration interface
interface StopConfig {
  id: string;
  busLine: string;
  routeName: string;
  stopName: string;
  walkTimeMinutes: number;
}

// Parse all stops from environment variables
function parseStopsFromEnv(): StopConfig[] {
  const count = parseInt(process.env.STOP_COUNT || "0", 10);
  const stops: StopConfig[] = [];

  // Try new multi-stop format first
  for (let i = 1; i <= count; i++) {
    const id = process.env[`STOP_${i}_ID`];
    if (id) {
      stops.push({
        id,
        busLine: process.env[`STOP_${i}_BUS_LINE`] || "",
        routeName: process.env[`STOP_${i}_ROUTE_NAME`] || "",
        stopName: process.env[`STOP_${i}_STOP_NAME`] || "",
        walkTimeMinutes: parseInt(process.env[`STOP_${i}_WALK_TIME_MINUTES`] || "10", 10),
      });
    }
  }

  // Fallback to legacy single-stop config
  if (stops.length === 0) {
    stops.push({
      id: process.env.STOP_ID || "490000118P",
      busLine: process.env.BUS_LINE || "9",
      routeName: process.env.ROUTE_NAME || "9 to Kensington Palace",
      stopName: process.env.STOP_NAME || "Hyde Park Corner",
      walkTimeMinutes: parseInt(process.env.WALK_TIME_MINUTES || "10", 10),
    });
  }

  return stops;
}

// Weather icon component
const WeatherIcon = ({ icon, size = 48 }: { icon: string; size?: number }) => {
  const props = { size, strokeWidth: 1.5, color: TFL_BLUE };
  switch (icon) {
    case "sun":
      return <Sun {...props} />;
    case "cloud-sun":
      return <CloudSun {...props} />;
    case "cloud":
      return <Cloud {...props} />;
    case "cloud-rain":
      return <CloudRain {...props} />;
    case "cloud-snow":
      return <CloudSnow {...props} />;
    case "snowflake":
      return <Snowflake {...props} />;
    case "cloud-lightning":
      return <CloudLightning {...props} />;
    default:
      return <Cloud {...props} />;
  }
};

// Official TfL Roundel Logo (from brand assets)
const TflLogo = ({ size = 50 }: { size?: number }) => {
  return (
    <svg width={size} height={size * 0.81} viewBox="0 0 615.322 500">
      <g>
        <path fill={TFL_BLUE} d="M469.453,249.986c0,89.078-72.26,161.308-161.337,161.308c-89.1,0-161.294-72.23-161.294-161.308
          c0-89.063,72.194-161.286,161.294-161.286C397.194,88.699,469.453,160.922,469.453,249.986 M308.116,0
          C170.027,0,58.094,111.925,58.094,249.986C58.094,388.06,170.027,500,308.116,500c138.06,0,249.985-111.94,249.985-250.014
          C558.101,111.925,446.176,0,308.116,0"/>
        <rect y="199.516" fill={TFL_BLUE} width="615.322" height="101.129"/>
      </g>
    </svg>
  );
};

// Navigation bar component (tube-line style)
interface NavigationBarProps {
  stops: StopConfig[];
  currentIndex: number;
  leaveTimes: (LeaveTimeInfo | null)[];
}

const NavigationBar = ({ stops, currentIndex, leaveTimes }: NavigationBarProps) => {
  if (stops.length <= 1) return null;

  const dotSize = 36;
  const lineThickness = 8;
  const spacing = Math.min(300, (1680 - 120) / stops.length);

  return (
    <div
      style={{
        backgroundColor: WHITE_BG,
        borderRadius: BORDER_RADIUS,
        padding: "16px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: TFL_BLUE,
      }}
    >
      {/* Bus lines and times row */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: `${spacing - 60}px`,
          marginBottom: "8px",
        }}
      >
        {stops.map((stop, i) => {
          const leaveInfo = leaveTimes[i];
          const leaveText = leaveInfo
            ? leaveInfo.isLeaveNow
              ? "NOW"
              : `${Math.max(0, Math.round(leaveInfo.leaveInSeconds / 60))}m`
            : "--";

          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "80px",
              }}
            >
              <span
                style={{
                  fontSize: "32px",
                  fontWeight: i === currentIndex ? "800" : "600",
                  opacity: i === currentIndex ? 1 : 0.7,
                }}
              >
                {stop.busLine}
              </span>
              <span
                style={{
                  fontSize: "28px",
                  fontWeight: i === currentIndex ? "700" : "500",
                  opacity: i === currentIndex ? 1 : 0.6,
                }}
              >
                {leaveText}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tube line with dots */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {stops.map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                borderRadius: "50%",
                backgroundColor: i === currentIndex ? TFL_BLUE : WHITE_BG,
                border: `${lineThickness}px solid ${TFL_BLUE}`,
                boxSizing: "border-box",
                zIndex: 1,
              }}
            />
            {/* Line segment (not after last dot) */}
            {i < stops.length - 1 && (
              <div
                style={{
                  width: `${spacing - dotSize}px`,
                  height: `${lineThickness}px`,
                  backgroundColor: TFL_BLUE,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default async function RenderPage({
  searchParams,
}: {
  searchParams: Promise<{ stop?: string }>;
}) {
  const params = await searchParams;
  const stops = parseStopsFromEnv();
  const stopIndex = Math.max(0, Math.min(stops.length - 1, parseInt(params.stop || "1", 10) - 1));
  const currentStop = stops[stopIndex];

  // Fetch data for ALL stops (for navigation bar) and weather in parallel
  const [allArrivalsData, weather] = await Promise.all([
    Promise.all(stops.map(stop => fetchBusArrivals(stop.id, stop.busLine))),
    fetchWeather(),
  ]);

  const currentTime = new Date();
  const data = allArrivalsData[stopIndex];

  // Calculate leave times for all stops (for navigation bar)
  const leaveTimes = stops.map((stop, i) => {
    const arrivals = allArrivalsData[i];
    const targetBus = arrivals.arrivals.find(
      (bus) => bus.timeToStation >= stop.walkTimeMinutes * 60
    );
    return targetBus ? calculateLeaveTime(targetBus.timeToStation, stop.walkTimeMinutes) : null;
  });

  // Current stop bus selection
  const targetBus = data.arrivals.find(
    (bus) => bus.timeToStation >= currentStop.walkTimeMinutes * 60
  );

  const targetIndex = targetBus
    ? data.arrivals.findIndex((b) => b.id === targetBus.id)
    : -1;
  const nextBus = targetIndex >= 0 ? data.arrivals[targetIndex + 1] : null;

  const leaveInfo = leaveTimes[stopIndex];

  return (
    <div
      data-render-ready="true"
      style={{
        width: "1680px",
        height: "1264px",
        backgroundColor: DARK_BG,
        fontFamily: FONT_FAMILY,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        gap: "12px",
        boxSizing: "border-box",
      }}
    >
      {/* BOX 1: Header */}
      <div
        style={{
          backgroundColor: WHITE_BG,
          borderRadius: BORDER_RADIUS,
          padding: "20px 36px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: TFL_BLUE,
        }}
      >
        <div
          style={{
            fontSize: "56px",
            fontWeight: "800",
            letterSpacing: "0.5px",
          }}
        >
          {currentStop.stopName.toUpperCase()}, {currentStop.busLine}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "56px",
            fontWeight: "700",
          }}
        >
          <span>{formatTimeShort(currentTime)}</span>
          {weather.current && (
            <>
              <span>|</span>
              <span>{weather.current.temperature}°C</span>
              <WeatherIcon icon={getWeatherIcon(weather.current.weatherCode)} size={52} />
            </>
          )}
        </div>
      </div>

      {/* BOX 2: Main Content */}
      <div
        style={{
          flex: 1,
          backgroundColor: WHITE_BG,
          borderRadius: BORDER_RADIUS,
          padding: "28px 36px",
          display: "flex",
          flexDirection: "column",
          color: TFL_BLUE,
        }}
      >
        {/* Route Title */}
        <div
          style={{
            fontSize: "130px",
            fontWeight: "700",
          }}
        >
          {currentStop.routeName}
        </div>

        {/* Inner Bordered Box with Current and Next Bus */}
        <div
          style={{
            border: `6px solid ${TFL_BLUE}`,
            borderRadius: INNER_BORDER_RADIUS,
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            marginBottom: "auto",
          }}
        >
          {/* Current Bus Section */}
          <div
            style={{
              padding: "24px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            {leaveInfo && targetBus ? (
              <>
                <ArrowRight size={120} strokeWidth={4} color={TFL_BLUE} style={{ flexShrink: 0, marginRight: "24px" }} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>
                    <span style={{ fontSize: "56px", fontWeight: "700" }}>
                      {leaveInfo.isLeaveNow
                        ? "LEAVE NOW!"
                        : `LEAVE BY ${formatTimeShort(leaveInfo.leaveTime)}`}
                    </span>
                    {!leaveInfo.isLeaveNow && (
                      <span style={{ fontSize: "56px", fontWeight: "500" }}>
                        {" "}(in {formatMinutes(leaveInfo.leaveInSeconds)})
                      </span>
                    )}
                  </span>
                  <div
                    style={{
                      fontSize: "64px",
                      fontWeight: "700",
                      marginTop: "4px",
                    }}
                  >
                    NEXT BUS: {formatMinutes(targetBus.timeToStation).toUpperCase()}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: "56px",
                  fontWeight: "500",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                No suitable buses available
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              borderTop: `6px solid ${TFL_BLUE}`,
            }}
          />

          {/* Next Bus Section (Following Bus) */}
          <div
            style={{
              padding: "24px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: "176px",
            }}
          >
            {nextBus ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {(() => {
                  const laterLeaveInfo = calculateLeaveTime(nextBus.timeToStation, currentStop.walkTimeMinutes);
                  return (
                    <span>
                      <span style={{ fontSize: "52px", fontWeight: "700" }}>
                        {laterLeaveInfo.isLeaveNow
                          ? "LEAVE NOW!"
                          : `LEAVE BY ${formatTimeShort(laterLeaveInfo.leaveTime)}`}
                      </span>
                      {!laterLeaveInfo.isLeaveNow && (
                        <span style={{ fontSize: "52px", fontWeight: "500" }}>
                          {" "}(in {formatMinutes(laterLeaveInfo.leaveInSeconds)})
                        </span>
                      )}
                    </span>
                  );
                })()}
                <div
                  style={{
                    fontSize: "56px",
                    fontWeight: "700",
                    marginTop: "4px",
                  }}
                >
                  LATER BUS: {formatMinutes(nextBus.timeToStation).toUpperCase()}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: "52px",
                  fontWeight: "500",
                }}
              >
                No later buses
              </div>
            )}
          </div>
        </div>

        {/* Footer - INSIDE white box */}
        <div
          style={{
            paddingTop: "16px",
            paddingBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <TflLogo size={44} />
          <span
            style={{
              fontSize: "26px",
              fontWeight: "400",
              color: TFL_BLUE,
            }}
          >
            Last updated: {formatTime(data.lastUpdated)}
          </span>
        </div>
      </div>

      {/* BOX 3: Navigation Bar (only if multiple stops) */}
      <NavigationBar
        stops={stops}
        currentIndex={stopIndex}
        leaveTimes={leaveTimes}
      />
    </div>
  );
}
