import { Line, LineChart, YAxis } from 'recharts'

export default function Sparkline({
  values,
  tone = 'var(--primary)',
}: {
  values: number[]
  tone?: string
}) {
  const data = values.map((value, index) => ({ index, value }))

  return (
    <LineChart width={88} height={28} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
      <YAxis hide domain={[0, 100]} />
      <Line
        type="monotone"
        dataKey="value"
        stroke={tone}
        strokeWidth={2}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  )
}
