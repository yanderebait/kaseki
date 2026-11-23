import { useCallback, useEffect, useState } from 'react'
import { weatherLabel, type WeatherResult } from '../../../../shared/widgets'

function dayName(date: string, index: number): string {
  if (index === 0) return 'Today'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date)
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

// Weather: current conditions and the next few days for one place. This is the
// only widget that uses the network, and it does nothing until it has been
// switched on and given a location in Settings → Weather widget. The forecast
// itself is fetched by the main process (the renderer has no network access)
// and reused for half an hour.
export default function WeatherWidget({
  onOpenSettings
}: {
  onOpenSettings?: (category: string) => void
}): React.JSX.Element {
  const [result, setResult] = useState<WeatherResult | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback((force = false) => {
    setBusy(true)
    window.kaseki.weather
      .get(force)
      .then(setResult)
      .finally(() => setBusy(false))
  }, [])

  useEffect(() => {
    load()
    // Re-read when the window regains focus: picks up a location just set in
    // Settings, and (past the half-hour cache) a fresher forecast.
    const onFocus = (): void => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (result === null) return <p className="widget-empty">&nbsp;</p>

  if (result.status === 'off' || result.status === 'unset') {
    return (
      <div className="widget-weather-setup">
        <p className="widget-empty">
          {result.status === 'off'
            ? 'The weather widget is off. Turning it on sends your chosen location to Open-Meteo, and nothing else.'
            : 'Weather is on but has no location yet.'}
        </p>
        <button
          type="button"
          className="settings-inline-btn"
          onClick={() => onOpenSettings?.('Weather widget')}
        >
          Open weather settings
        </button>
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="widget-weather-setup">
        <p className="widget-empty">{result.message}</p>
        <button type="button" className="settings-inline-btn" disabled={busy} onClick={() => load(true)}>
          Try again
        </button>
      </div>
    )
  }

  const { report } = result
  const unit = report.units === 'fahrenheit' ? '°F' : '°C'
  return (
    <div className="widget-weather">
      <div className="widget-weather-now">
        <span className="widget-weather-temp">
          {Math.round(report.temperature)}
          {unit}
        </span>
        <span className="widget-weather-meta">
          <span className="widget-weather-label">{weatherLabel(report.code)}</span>
          <span className="widget-weather-place">{report.place}</span>
        </span>
      </div>
      <ul className="widget-weather-days">
        {report.days.map((d, i) => (
          <li key={d.date}>
            <span className="widget-weather-day">{dayName(d.date, i)}</span>
            <span className="widget-weather-daylabel">{weatherLabel(d.code)}</span>
            <span className="widget-weather-range">
              {Math.round(d.high)}° / {Math.round(d.low)}°
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
