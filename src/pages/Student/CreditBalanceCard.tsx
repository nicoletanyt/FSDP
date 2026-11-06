import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Ticket } from 'lucide-react'

export default function CreditBalanceCard() {
  const [credits, setCredits] = useState(0)

  useEffect(() => {
    // 从本地存储读取当前余额
    const saved = parseInt(localStorage.getItem('student_credits') || '0')
    setCredits(saved)
  }, [])

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2c3f67] to-[#1a273f] p-6 text-white shadow-lg">
      <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-[#e62128]/20 rounded-full blur-xl"></div>
      
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Ticket className="w-5 h-5 text-blue-300" />
            <h3 className="font-medium text-blue-100">Available Credits</h3>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-5xl font-extrabold">{credits}</span>
            <span className="text-blue-200">/ classes</span>
          </div>
          <p className="text-xs text-blue-200/80 mt-2">1 Credit = 1 Training Session</p>
        </div>
        
        <Link 
          to="/student/credits"
          className="flex items-center gap-2 bg-white hover:bg-gray-100 text-[#2c3f67] px-4 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Top Up
        </Link>
      </div>
    </div>
  )
}