import { Outlet } from 'react-router'
import { useMemo, useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getOfferings } from '@/lib/student-schedule'
import { useStudentEnrollments } from '@/lib/student-enrolments'

export default function StudentLayout() {
  const { profile } = useAuth()
  const classes = useMemo(() => getOfferings(), [])
  const schedule = useStudentEnrollments(profile?.id ?? 'unknown', classes)
  
  // 👇 新增全局 credits 状态
  const [credits, setCredits] = useState(0)

  // 初始化时从 localStorage 读取
  useEffect(() => {
    const saved = localStorage.getItem('student_credits')
    if (saved) setCredits(parseInt(saved))
  }, [])

  // 封装增加点数的方法（购买页面会用到）
  const addCredits = (amount: number) => {
    setCredits(prev => {
      const newVal = prev + amount
      localStorage.setItem('student_credits', newVal.toString())
      return newVal
    })
  }

  // 封装扣除点数的方法（报名页面会用到）
  const deductCredit = () => {
    if (credits <= 0) return false
    setCredits(prev => {
      const newVal = prev - 1
      localStorage.setItem('student_credits', newVal.toString())
      return newVal
    })
    return true
  }

  return <Outlet context={{ 
    classes, 
    schedule, 
    credits, 
    addCredits, 
    deductCredit 
  }} />
}

// 👇 更新 Context 的 TypeScript 类型
export type StudentContext = { 
  classes: ReturnType<typeof getOfferings>; 
  schedule: ReturnType<typeof useStudentEnrollments>;
  credits: number;
  addCredits: (amount: number) => void;
  deductCredit: () => boolean;
}