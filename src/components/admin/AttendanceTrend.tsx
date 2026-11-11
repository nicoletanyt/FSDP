import { useId, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { WeeklyTrendPoint } from '@/lib/admin/types'

type Metric = 'rate' | 'sessions'

export default function AttendanceTrend({ data }: { data: WeeklyTrendPoint[] }) {
  const [metric, setMetric] = useState<Metric>('rate')
  const [weeks, setWeeks] = useState<4 | 8 | 12>(8)
  const [showTable, setShowTable] = useState(false)
  const gradientId = `attendance-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const metricLabel = metric === 'rate' ? 'Attendance rate' : 'Sessions held'
  const visibleData = data.slice(-weeks)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{metricLabel} · Last {weeks} weeks</p>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filter
            </PopoverTrigger>
            <PopoverContent className="w-56 gap-3">
              <PopoverTitle>Attendance trend</PopoverTitle>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">Measure</legend>
                {([['rate', 'Attendance rate'], ['sessions', 'Sessions held']] as const).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <input type="radio" name={`${gradientId}-metric`} checked={metric === value} onChange={() => setMetric(value)} className="accent-primary" />
                    {label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-1 border-t border-border pt-3">
                <legend className="text-xs font-medium text-muted-foreground">Period</legend>
                {([4, 8, 12] as const).map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <input type="radio" name={`${gradientId}-weeks`} checked={weeks === value} onChange={() => setWeeks(value)} className="accent-primary" />
                    Last {value} weeks
                  </label>
                ))}
              </fieldset>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="sm"
            variant={showTable ? 'secondary' : 'ghost'}
            aria-pressed={showTable}
            onClick={() => setShowTable((current) => !current)}
          >
            {showTable ? 'Show chart' : 'View as table'}
          </Button>
        </div>
      </div>

      {showTable ? (
        <div className="h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Weekly attendance trend as a table
            </caption>
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Week of
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Attendance rate
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sessions held
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleData.map((point) => (
                <tr key={point.label} className="border-t border-border/70">
                  <td className="px-3 py-2 text-muted-foreground">{point.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{point.rate}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{point.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visibleData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickMargin={8}
              />
              <YAxis
                domain={metric === 'rate' ? [0, 100] : [0, 'auto']}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickFormatter={(value: number) =>
                  metric === 'rate' ? `${value}%` : `${value}`
                }
                width={44}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  color: 'var(--popover-foreground)',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--muted-foreground)' }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={metricLabel}
                unit={metric === 'rate' ? '%' : ''}
                stroke="var(--primary)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
