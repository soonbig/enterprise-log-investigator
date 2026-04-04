import type { Env } from '../types'

interface FetchLogsInput {
  start_time: string // ISO 8601, e.g. "2026-04-02T00:00:00Z"
  end_time: string
  include_firewall?: boolean
}

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'

const QUERY = `
  query LogAnalysis($zoneTag: String!, $start: String!, $end: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1hGroups(
          filter: { datetime_geq: $start, datetime_leq: $end }
          orderBy: [datetime_ASC]
          limit: 168
        ) {
          dimensions { datetime }
          sum { requests, cachedRequests, threats, bytes }
          uniq { uniques }
        }
        firewallEventsAdaptiveGroups(
          filter: { datetime_geq: $start, datetime_leq: $end }
          limit: 100
          orderBy: [count_DESC]
        ) {
          count
          dimensions { action, ruleId, clientIP, clientCountryName }
        }
      }
    }
  }
`

const MAX_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days in ms

// Fetch a single <=3day window from GraphQL
async function fetchWindow(start: string, end: string, env: Env) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        zoneTag: env.CF_ZONE_ID,
        start,
        end,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`)
  }

  const data: any = await res.json()

  if (data.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
  }

  return data.data.viewer.zones[0]
}

export async function fetchLogs(input: FetchLogsInput, env: Env) {
  const startMs = new Date(input.start_time).getTime()
  const endMs = new Date(input.end_time).getTime()
  const spanMs = endMs - startMs

  // Split into <=3day windows if needed
  const windows: Array<{ start: string; end: string }> = []
  if (spanMs <= MAX_WINDOW_MS) {
    windows.push({ start: input.start_time, end: input.end_time })
  } else {
    let cursor = startMs
    while (cursor < endMs) {
      const windowEnd = Math.min(cursor + MAX_WINDOW_MS, endMs)
      windows.push({
        start: new Date(cursor).toISOString(),
        end: new Date(windowEnd).toISOString(),
      })
      cursor = windowEnd
    }
    console.log(`[fetch_logs] split ${Math.round(spanMs / 86400000)}d range into ${windows.length} windows`)
  }

  // Fetch all windows (sequentially to avoid rate limits)
  let allHourly: any[] = []
  let allFw: any[] = []

  for (const w of windows) {
    const zone = await fetchWindow(w.start, w.end, env)
    allHourly = allHourly.concat(zone.httpRequests1hGroups ?? [])
    allFw = allFw.concat(zone.firewallEventsAdaptiveGroups ?? [])
  }

  // Deduplicate hourly data (overlapping window edges)
  const seen = new Set<string>()
  const hourlyRaw = allHourly
    .filter((g: any) => {
      const key = g.dimensions.datetime
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((g: any) => ({
      t: g.dimensions.datetime,
      req: g.sum.requests,
      threats: g.sum.threats,
      uniq: g.uniq.uniques,
    }))

  // Compact CSV format to minimize token usage
  const hourlyCsv = 'datetime,requests,threats,unique_visitors\n' +
    hourlyRaw.map((h: any) => `${h.t},${h.req},${h.threats},${h.uniq}`).join('\n')

  // Aggregate and deduplicate firewall events by IP
  const fwMap = new Map<string, any>()
  for (const g of allFw) {
    const key = `${g.dimensions.clientIP}|${g.dimensions.ruleId}`
    const existing = fwMap.get(key)
    if (existing) {
      existing.count += g.count
    } else {
      fwMap.set(key, {
        ip: g.dimensions.clientIP,
        country: g.dimensions.clientCountryName,
        action: g.dimensions.action,
        rule: g.dimensions.ruleId,
        count: g.count,
      })
    }
  }

  const fw = [...fwMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const fwCsv = fw.length
    ? 'ip,country,action,rule,count\n' +
      fw.map((f: any) => `${f.ip},${f.country},${f.action},${f.rule},${f.count}`).join('\n')
    : 'No firewall events in this period.'

  const totalReqs = hourlyRaw.reduce((s: number, h: any) => s + h.req, 0)
  const totalThreats = hourlyRaw.reduce((s: number, h: any) => s + h.threats, 0)

  return {
    period: `${input.start_time} to ${input.end_time}`,
    totalRequests: totalReqs,
    totalThreats: totalThreats,
    dataPoints: hourlyRaw.length,
    hourlyData: hourlyCsv,
    firewallTopEvents: fwCsv,
    note: 'Data is in CSV format. Use pandas read_csv(io.StringIO(data)) to parse.',
  }
}
