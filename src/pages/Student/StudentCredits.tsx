import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router'
import { CreditCard, Sparkles, User, Baby } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StudentContext } from '@/layouts/StudentLayout'

// 👇 精准还原图一（成人）和图二（儿童）的套餐数据
const PACKAGES = {
  adult: [
    { id: 'adult-10', title: '10 Session Pass', price: 270.00, credits: 10, unitPrice: '$27 / Session', validity: 'Valid for 11 weeks', popular: false },
    { id: 'adult-25', title: '25 Session Pass', price: 600.00, credits: 25, unitPrice: '$24 / Session', validity: 'Valid for 4 months', popular: true },
    { id: 'adult-50', title: '50 Session Pass', price: 980.00, credits: 50, unitPrice: '$19.60 / Session', validity: 'Valid for 6 months', popular: false },
    { id: 'adult-1y', title: '1 Year Unlimited Pass', price: 2246.40, credits: 9999, unitPrice: 'Inclusive 10% Discount', validity: 'Valid for 12 months', popular: false },
    { id: 'adult-12w', title: "12 Weeks' Unlimited Pass", price: 96.00, credits: 9999, unitPrice: '6 Recurring Payments', validity: 'Billed every 2 weeks', popular: false },
    { id: 'adult-3m', title: "3 month's Unlimited Sessions", price: 576.00, credits: 9999, unitPrice: 'Unlimited Sessions', validity: 'Valid for 3 months', popular: false }
  ],
  children: [
    { id: 'child-1m', title: '1 Month Pass', price: 150.00, credits: 4, unitPrice: '$37.50 / Session', validity: 'Valid for 5 weeks', popular: false },
    { id: 'child-6m-24', title: '6 Months Pass', price: 834.00, credits: 24, unitPrice: '24 Sessions', validity: 'Valid for 6 months', popular: true },
    { id: 'child-6m-50', title: '6 Months Pass', price: 1200.00, credits: 50, unitPrice: '50 Sessions', validity: 'Valid for 6 months', popular: false }
  ]
}

export default function StudentCredits() {
  const navigate = useNavigate()
  const { addCredits } = useOutletContext<StudentContext>()
  const [loading, setLoading] = useState<string | null>(null)
  
  // 👇 状态：判断当前用户是成人还是儿童
  const [userType, setUserType] = useState<'adult' | 'children'>('adult')

  // 👇 核心逻辑：根据 DOB 计算年龄
  useEffect(() => {
    // 1. 尝试从本地存储获取注册时填的生日
    // 注意：如果你们以后接了数据库，这里应该改成从 useAuth() 获取 profile.dob
    const savedDob = localStorage.getItem('user_dob') 
    
    if (savedDob) {
      const birthDate = new Date(savedDob)
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const m = today.getMonth() - birthDate.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }
      
      // 如果年龄小于 13 岁，判定为儿童
      if (age < 13) {
        setUserType('children')
      } else {
        setUserType('adult')
      }
    } else {
      // 为了演示：如果本地没存 DOB，默认显示成人，但你可以在页面上给个按钮强制切换测试
      console.log('No DOB found, defaulting to Adult.')
    }
  }, [])

  const handlePurchase = async (planId: string, creditsToAdd: number) => {
    setLoading(planId)
    setTimeout(() => {
      addCredits(creditsToAdd)
      setLoading(null)
      navigate('/dashboard')
    }, 1500)
  }

  const currentPackages = PACKAGES[userType]

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      
      {/* 👇 开发者测试用按钮（仅为了让你在答辩时随时切换看效果，真实上线可删掉） */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
          <button 
            onClick={() => { setUserType('adult'); localStorage.setItem('user_dob', '2000-01-01') }}
            className={`px-3 py-1 rounded ${userType === 'adult' ? 'bg-white shadow text-black' : 'text-gray-500'}`}
          >
            Simulate Adult
          </button>
          <button 
            onClick={() => { setUserType('children'); localStorage.setItem('user_dob', '2018-01-01') }}
            className={`px-3 py-1 rounded ${userType === 'children' ? 'bg-white shadow text-black' : 'text-gray-500'}`}
          >
            Simulate Child
          </button>
        </div>
      </div>

      {/* 头部标题区 */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
          <CreditCard className="w-8 h-8 text-[#2c3f67] dark:text-blue-400" />
        </div>
        <h1 className="text-3xl font-extrabold text-[#2c3f67] dark:text-white mb-3">
          {userType === 'adult' ? 'Adult Class Passes' : 'Children Class Passes'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xl mx-auto flex items-center justify-center gap-2">
          {userType === 'adult' ? <User className="w-4 h-4" /> : <Baby className="w-4 h-4" />}
          {userType === 'adult' 
            ? 'You are registered as an Adult member. Purchase session passes below.' 
            : 'You are registered as a Children member. Purchase session passes below.'}
        </p>
      </div>

      {/* 套餐列表 */}
      <div className="space-y-4">
        {currentPackages.map((plan) => (
          <div 
            key={plan.id} 
            className={`relative flex flex-col sm:flex-row sm:items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all ${
              plan.popular 
                ? 'bg-[#f0f4f8] dark:bg-slate-800/80 border-[#2c3f67]/30 dark:border-blue-500/30 shadow-md' 
                : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-[#2c3f67]/30 dark:hover:border-slate-700 shadow-sm'
            }`}
          >
            {/* 左侧信息 */}
            <div className="mb-4 sm:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-[#2c3f67] dark:text-white">
                  {plan.title}
                </h3>
                {plan.popular && (
                  <span className="bg-[#e62128] text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Popular
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                {plan.credits === 9999 ? 'Unlimited Credits' : `${plan.credits} Credits`} - {plan.validity}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
                  ${plan.price.toFixed(2)}
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  ({plan.unitPrice})
                </span>
              </div>
            </div>

            {/* 右侧按钮 */}
            <Button
              onClick={() => handlePurchase(plan.id, plan.credits)}
              disabled={loading !== null}
              className={`w-full sm:w-auto px-8 h-11 rounded-xl font-bold transition-all ${
                plan.popular
                  ? 'bg-[#2c3f67] hover:bg-[#1f2d4a] text-white dark:bg-blue-600 dark:hover:bg-blue-700'
                  : 'bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
              }`}
            >
              {loading === plan.id ? 'Processing...' : 'Purchase'}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-10">
        All prices are in SGD. Your pass type is automatically determined by your registered Date of Birth.
      </p>
    </div>
  )
}
