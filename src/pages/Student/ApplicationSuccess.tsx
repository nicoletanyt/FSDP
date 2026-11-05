import { useState } from 'react'
import { Link } from 'react-router'
// 使用 buttonVariants 生成按钮样式，避免 Button 组件的 asChild 属性引发 TS 类型报错
import { buttonVariants } from '@/components/ui/button'
import { CheckCircle2, Copy, Check } from 'lucide-react'

export default function ApplicationSuccess() {
  // 控制复制按钮的图标切换状态
  const [copied, setCopied] = useState(false)
  
  // TODO: 后续接入 Supabase 后，通过 useLocation() 从路由 state 获取真实生成的 ID
  const membershipId = 'ASJ2025O0123'

  const handleCopy = () => {
    // 调用浏览器原生剪贴板 API
    navigator.clipboard.writeText(membershipId)
    setCopied(true)
    // 2秒后重置图标状态
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    // 关键：加入了 dark:bg-slate-950 等前缀，实现深色模式适配
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center bg-[#f8fafc] dark:bg-slate-950 px-4 py-12 relative overflow-hidden transition-colors">
      
      {/* 背景水印装饰 */}
      <div className="absolute bottom-0 right-0 opacity-5 dark:opacity-[0.02] pointer-events-none select-none">
        <svg width="400" height="300" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 80h60M30 80V50H70V80M25 50L50 30L75 50H25Z" stroke="#2c3f67" strokeWidth="4"/>
        </svg>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center z-10">
        
        {/* 成功图标：深色模式下边框和图标颜色变亮 */}
        <div className="mb-6 rounded-full border-[3px] border-[#2c3f67] dark:border-blue-400 p-2 transition-colors">
          <CheckCircle2 className="w-16 h-16 text-[#2c3f67] dark:text-blue-400 transition-colors" strokeWidth={1.5} />
        </div>

        {/* 标题与副标题文案根据“先登录后申请”的业务逻辑调整 */}
        <h1 className="text-3xl font-bold text-[#2c3f67] dark:text-white mb-3 transition-colors">
          Application Submitted!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8 max-w-md transition-colors">
          Thank you for joining Aikido Shinju-Kai. Your membership application has been successfully submitted and is pending review.
        </p>

        {/* What happens next 提示框：深色模式下背景变深灰 */}
        <div className="w-full bg-[#f0f4f8] dark:bg-slate-900 rounded-xl p-6 sm:p-8 mb-8 transition-colors">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle2 className="w-5 h-5 text-[#2c3f67] dark:text-blue-400 transition-colors" />
            <h3 className="font-bold text-[#2c3f67] dark:text-blue-400 text-lg transition-colors">
              What happens next?
            </h3>
          </div>
          
          <div className="space-y-5">
            {/* 遍历渲染后续步骤，降低代码重复 */}
            {[
              "You will receive a confirmation email with your Membership ID and payment instructions within 1-2 business days.",
              "Please check your email (and spam folder) for further instructions on payment and next steps.",
              "If you have any questions, feel free to contact us at"
            ].map((text, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold mt-0.5 transition-colors">
                  {index + 1}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed transition-colors">
                  {text}
                  {/* 只在最后一条文本后面追加可点击的 mailto 邮箱链接 */}
                  {index === 2 && (
                    <a href="mailto:membership@aikidoshinjukai.com.sg" className="text-[#e62128] dark:text-red-400 hover:underline font-medium ml-1">
                      membership@aikidoshinjukai.com.sg
                    </a>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Membership ID 展示卡片，深色模式下卡片背景变深色 */}
        <div className="flex flex-col items-center mb-10">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 transition-colors">
            Your Membership ID
          </p>
          <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1 shadow-sm transition-colors">
            <span className="px-6 py-2 text-lg font-bold tracking-widest text-[#2c3f67] dark:text-blue-400 transition-colors">
              {membershipId}
            </span>
            <button 
              onClick={handleCopy}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
              title="Copy to clipboard"
            >
              {/* 根据 copied 状态切换图标 */}
              {copied ? (
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              )}
            </button>
          </div>
        </div>

        {/* 用 Link 代替 Button 包裹，保证路由跳转不刷新页面且样式统一 */}
        <Link 
          to="/dashboard" 
          className={buttonVariants({ 
            className: "w-full sm:w-[300px] bg-[#2c3f67] dark:bg-blue-600 hover:bg-[#1f2d4a] dark:hover:bg-blue-700 text-white h-12 text-base font-medium rounded-md flex items-center justify-center transition-colors" 
          })}
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}