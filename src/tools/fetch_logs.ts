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

export async function fetchLogs(input: FetchLogsInput, env: Env) {
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
        start: input.start_time,
        end: input.end_time,
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

  const zone = data.data.viewer.zones[0]

  // Compact CSV-like format to minimize token usage
  const hourlyRaw = (zone.httpRequests1hGroups ?? []).map((g: any) => ({
    t: g.dimensions.datetime,
    req: g.sum.requests,
    threats: g.sum.threats,
    uniq: g.uniq.uniques,
  }))

  // Convert to CSV string — much more compact than JSON array
  const hourlyCsv = 'datetime,requests,threats,unique_visitors\n' +
    hourlyRaw.map((h: any) => `${h.t},${h.req},${h.threats},${h.uniq}`).join('\n')

  const fw = (zone.firewallEventsAdaptiveGroups ?? [])
    .slice(0, 15) // top 15 only
    .map((g: any) => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      action: g.dimensions.action,
      rule: g.dimensions.ruleId,
      count: g.count,
    }))

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
    hourlyData: hourlyCsv,
    firewallTopEvents: fwCsv,
    note: 'Data is in CSV format. Use pandas read_csv(io.StringIO(data)) to parse.',
  }
}
