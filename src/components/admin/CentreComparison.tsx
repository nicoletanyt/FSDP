import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CentreStats } from '@/lib/admin/types'

export default function CentreComparison({
  data,
  names,
}: {
  data: CentreStats[]
  names: Record<string, string>
}) {
  const chartData = data.map((centre) => ({
    name: names[centre.centreId] ?? centre.centreId,
    rate: Math.round(centre.attendanceRate),
    label: `${Math.round(centre.attendanceRate)}%`,
    students: centre.studentCount,
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 44, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            width={100}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            contentStyle={{
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="rate"
            name="Attendance rate"
            fill="var(--primary)"
            radius={[0, 6, 6, 0]}
            barSize={18}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="label"
              position="right"
              fill="var(--muted-foreground)"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
