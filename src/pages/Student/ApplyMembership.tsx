import { useState, useEffect } from 'react' // 👈 引入 useEffect
import { useNavigate } from 'react-router' 
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase' // 👈 引入 supabase
import { Check, ChevronDown, ChevronUp, UploadCloud } from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Personal\nInfo' },
  { id: 2, title: 'Training\nInfo' },
  { id: 3, title: 'Emergency\nContact' },
  { id: 4, title: 'Review &\nSubmit' },
]

const generateMembershipId = () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `ASJ${year}${randomNum}`;
};

const getTodayDate = () => new Date().toISOString().split('T')[0];

const isValidNric = (nric: string) => {
  return /^[STFGM]\d{7}[A-Z]$/i.test(nric);
}

export default function ApplyMembership() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [showGuardian, setShowGuardian] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDeclared, setIsDeclared] = useState(false)

  const [formData, setFormData] = useState({
    fullName: '', nric: '', nationality: '', dob: '', gender: '',
    email: '', // 👈 初始为空，靠 useEffect 动态获取
    mobile: '', address: '', photoName: '',
    principalDojo: '', membershipType: '', currentBelt: '', hasExperience: 'no', experienceDetails: '',
    emergencyName: '', emergencyRelationship: '', emergencyPhone: '',
    medicalDetails: '', medicalConfirm: false,
    guardianName: '', guardianNric: '', guardianRelationship: '', guardianPhone: '',
  })

  // 👈 自动获取当前登录用户的邮箱
  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setFormData(prev => ({ ...prev, email: user.email! }))
      }
    }
    fetchUserEmail()
  }, [])

  const validateStep = (step: number) => {
    setErrorMsg('')
    
    if (step === 1) {
      if (!formData.fullName || !formData.nric || !formData.nationality || !formData.dob || !formData.gender || !formData.mobile || !formData.address) {
        setErrorMsg('Please fill in all required Personal Information fields.')
        return false
      }
      if (!formData.photoName) {
        setErrorMsg('Please upload a profile photo to continue.')
        return false
      }
      if (!isValidNric(formData.nric)) {
        setErrorMsg('Invalid NRIC / FIN format. Please use format like S1234567A.')
        return false
      }
      if (formData.mobile.length !== 8) {
        setErrorMsg('Mobile number must be exactly 8 digits.')
        return false
      }
    }

    if (step === 2) {
      if (!formData.principalDojo || !formData.membershipType || !formData.currentBelt) {
        setErrorMsg('Please select your Dojo, Membership Type, and Current Belt.')
        return false
      }
    }

    if (step === 3) {
      if (!formData.emergencyName || !formData.emergencyRelationship || !formData.emergencyPhone) {
        setErrorMsg('Please complete the emergency contact details.')
        return false
      }
      if (formData.emergencyPhone.length !== 8) {
        setErrorMsg('Emergency contact number must be exactly 8 digits.')
        return false
      }
      if (formData.guardianNric && !isValidNric(formData.guardianNric)) {
        setErrorMsg('Invalid Guardian NRIC / FIN format.')
        return false
      }
      if (formData.guardianPhone && formData.guardianPhone.length !== 8) {
        setErrorMsg('Guardian contact number must be exactly 8 digits.')
        return false
      }
      if (!formData.medicalConfirm) {
        setErrorMsg('You must confirm the medical declaration.')
        return false
      }
    }

    if (step === 4) {
      if (!isDeclared) {
        setErrorMsg('You must agree to the declaration before submitting.')
        return false
      }
    }
    
    return true
  }

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    } else {
      setIsSubmitting(true)
      try {
        const finalDataToSubmit = {
          ...formData,
          membership_id: generateMembershipId(),
          start_date: getTodayDate(),
          belt_rank: 'Mukyu (White)',
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
        navigate('/apply-membership/success', { state: { 
            membershipId: finalDataToSubmit.membership_id,
            startDate: finalDataToSubmit.start_date,
            beltRank: finalDataToSubmit.belt_rank
        }}) 
      } catch (error) {
        setErrorMsg("Failed to submit application. Please try again.")
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleBack = () => {
    setErrorMsg('')
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFormData({ ...formData, photoName: file.name })
  }

  const formatPhone = (value: string) => {
    return value.replace(/\D/g, '').slice(0, 8);
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f4f5f7] dark:bg-slate-950 py-6 sm:py-10 px-2 sm:px-8 transition-colors">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-none p-5 sm:p-12 transition-colors">
        
        {/* 进度条 */}
        <div className="mb-8 sm:mb-12 flex items-start justify-between relative w-full max-w-3xl mx-auto px-2 sm:px-0">
          <div className="absolute top-4 sm:top-5 left-0 w-full h-[2px] bg-gray-200 dark:bg-slate-700 -z-10" />
          {STEPS.map((step) => (
            <div key={step.id} className="flex flex-col items-center relative z-10 w-16 sm:w-24">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold mb-2 transition-colors ${
                currentStep === step.id ? 'bg-[#2c3f67] dark:bg-blue-600 text-white' 
                : currentStep > step.id ? 'bg-[#2c3f67] dark:bg-blue-600 text-white'
                : 'bg-gray-300 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
              }`}>
                {currentStep > step.id ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : step.id}
              </div>
              <span className={`text-[10px] sm:text-xs text-center whitespace-pre-line font-medium transition-colors leading-tight ${
                currentStep >= step.id ? 'text-[#2c3f67] dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'
              }`}>
                {step.title}
              </span>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="mb-6 animate-in slide-in-from-top-2">
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Step 1 */}
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[#2c3f67] dark:text-white mb-1 sm:mb-2 transition-colors">Personal Information</h2>
              <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm transition-colors">Please fill in your personal details to create your membership profile</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 sm:gap-y-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Full Name</Label>
                <Input placeholder="Enter full name" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent focus-visible:ring-[#2c3f67] text-black dark:text-white" />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">NRIC / FIN</Label>
                <Input 
                  placeholder="e.g. S1234567A" 
                  value={formData.nric} 
                  onChange={(e) => setFormData({...formData, nric: e.target.value.toUpperCase()})} 
                  className="h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent focus-visible:ring-[#2c3f67] text-black dark:text-white uppercase" 
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Nationality</Label>
                <select value={formData.nationality} onChange={(e) => setFormData({...formData, nationality: e.target.value})} className="w-full h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent px-3 text-sm focus:ring-[#2c3f67] text-black dark:text-white">
                  <option value="" disabled>Select nationality</option>
                  <option value="singaporean">Singaporean</option>
                  <option value="pr">Singapore PR</option>
                  <option value="foreigner">Foreigner</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Date of Birth</Label>
                <Input type="date" value={formData.dob} onChange={(e) => setFormData({...formData, dob: e.target.value})} className="h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent focus-visible:ring-[#2c3f67] text-black dark:text-white" />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Gender</Label>
                <select value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value})} className="w-full h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent px-3 text-sm focus:ring-[#2c3f67] text-black dark:text-white">
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              
              {/* 👈 锁定的 Email 输入框 */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Email Address</Label>
                <Input 
                  type="email" 
                  value={formData.email} 
                  readOnly // 👈 设为只读
                  disabled // 👈 设为禁用
                  className="h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent opacity-70 cursor-not-allowed text-black dark:text-white" 
                />
                <p className="text-[10px] sm:text-xs text-gray-500">Linked to your login account.</p>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Mobile Number</Label>
                <div className="flex gap-2">
                  <div className="w-16 sm:w-24 h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 shrink-0">+65</div>
                  <Input 
                    type="tel" 
                    maxLength={8}
                    placeholder="8-digit number" 
                    value={formData.mobile} 
                    onChange={(e) => setFormData({...formData, mobile: formatPhone(e.target.value)})} 
                    className="flex-1 h-11 sm:h-12 lg:h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent focus-visible:ring-[#2c3f67] text-black dark:text-white" 
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2 sm:col-span-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Residential Address</Label>
                <textarea placeholder="Enter address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full min-h-[80px] sm:min-h-[100px] bg-gray-200/60 dark:bg-slate-800 rounded-md p-3 text-sm border-transparent focus:ring-[#2c3f67] resize-none text-black dark:text-white" />
              </div>
              <div className="space-y-1.5 sm:space-y-2 sm:col-span-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base transition-colors">Profile Photo <span className="text-[#e62128]">*</span></Label>
                <label className="flex flex-col items-center justify-center w-full h-28 sm:h-32 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl cursor-pointer bg-gray-50 dark:bg-slate-800/50">
                  <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                    <UploadCloud className="w-6 h-6 sm:w-8 sm:h-8 mb-1 sm:mb-2" />
                    <p className="text-xs sm:text-sm"><span className="font-semibold text-[#2c3f67] dark:text-blue-400">Click to upload</span></p>
                    {formData.photoName && <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-1">Selected: {formData.photoName}</p>}
                    {!formData.photoName && <p className="text-[10px] sm:text-xs text-[#e62128] dark:text-red-400 font-medium mt-1">Profile photo is required to continue.</p>}
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} required aria-required="true" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[#2c3f67] dark:text-white mb-1 sm:mb-2">Training Information</h2>
            </div>
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base">Principal Dojo</Label>
                <select value={formData.principalDojo} onChange={(e) => setFormData({...formData, principalDojo: e.target.value})} className="w-full h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent px-3 text-sm focus:ring-[#2c3f67] text-black dark:text-white">
                  <option value="" disabled>Select dojo</option>
                  <option value="central">Central Dojo</option>
                  <option value="east">East Dojo</option>
                  <option value="west">West Dojo</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base">Membership Type</Label>
                <select value={formData.membershipType} onChange={(e) => setFormData({...formData, membershipType: e.target.value})} className="w-full h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent px-3 text-sm focus:ring-[#2c3f67] text-black dark:text-white">
                  <option value="" disabled>Select type</option>
                  <option value="adult">Adult</option>
                  <option value="student">Student</option>
                  <option value="junior">Junior</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base">Current Belt Rank</Label>
                <select value={formData.currentBelt} onChange={(e) => setFormData({...formData, currentBelt: e.target.value})} className="w-full h-11 sm:h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent px-3 text-sm focus:ring-[#2c3f67] text-black dark:text-white">
                  <option value="" disabled>Select belt</option>
                  <option value="white">White Belt (Mukyu)</option>
                  <option value="yellow">Yellow Belt</option>
                  <option value="orange">Orange Belt</option>
                  <option value="green">Green Belt</option>
                  <option value="blue">Blue Belt</option>
                  <option value="brown">Brown Belt</option>
                  <option value="black">Black Belt</option>
                </select>
              </div>
              <div className="space-y-3 pt-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm sm:text-base">Previous Experience?</Label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="yes" checked={formData.hasExperience === 'yes'} onChange={(e) => setFormData({...formData, hasExperience: e.target.value})} className="w-4 h-4 sm:w-5 sm:h-5 text-[#2c3f67]" />
                    <span className="text-sm font-medium dark:text-gray-300">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="no" checked={formData.hasExperience === 'no'} onChange={(e) => setFormData({...formData, hasExperience: e.target.value})} className="w-4 h-4 sm:w-5 sm:h-5 text-[#2c3f67]" />
                    <span className="text-sm font-medium dark:text-gray-300">No</span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2 pt-2">
                <Label className="text-gray-700 dark:text-gray-400 text-xs sm:text-sm font-medium">If yes, provide details</Label>
                <textarea placeholder="Enter details (optional)" value={formData.experienceDetails} onChange={(e) => setFormData({...formData, experienceDetails: e.target.value})} disabled={formData.hasExperience === 'no'} className="w-full min-h-[100px] bg-gray-200/60 dark:bg-slate-800 rounded-md p-3 text-sm border-transparent focus:ring-[#2c3f67] resize-none disabled:opacity-50 text-black dark:text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[#2c3f67] dark:text-white mb-1 sm:mb-2">Emergency & Medical</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 p-4 sm:p-6 rounded-xl space-y-4 sm:space-y-5">
                <h3 className="text-base sm:text-lg font-bold text-[#2c3f67] dark:text-blue-400 mb-2">Emergency Contact</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-xs sm:text-sm">Full Name</Label>
                  <Input placeholder="Enter name" value={formData.emergencyName} onChange={(e) => setFormData({...formData, emergencyName: e.target.value})} className="h-11 sm:h-12 bg-white dark:bg-slate-900 border-transparent text-black dark:text-white" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-xs sm:text-sm">Relationship</Label>
                  <select value={formData.emergencyRelationship} onChange={(e) => setFormData({...formData, emergencyRelationship: e.target.value})} className="w-full h-11 sm:h-12 bg-white dark:bg-slate-900 rounded-md border-transparent px-3 text-sm text-black dark:text-white">
                    <option value="" disabled>Select relationship</option>
                    <option value="parent">Parent</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-xs sm:text-sm">Contact Number</Label>
                  <div className="flex gap-2">
                    <div className="w-16 sm:w-24 h-11 sm:h-12 bg-white dark:bg-slate-900 rounded-md flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 shrink-0">+65</div>
                    <Input 
                      type="tel" 
                      maxLength={8}
                      placeholder="8-digit number" 
                      value={formData.emergencyPhone} 
                      onChange={(e) => setFormData({...formData, emergencyPhone: formatPhone(e.target.value)})} 
                      className="flex-1 h-11 sm:h-12 lg:h-12 bg-white dark:bg-slate-900 border-transparent text-black dark:text-white" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 p-4 sm:p-6 rounded-xl space-y-4 sm:space-y-5 flex flex-col">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#2c3f67] dark:text-blue-400 mb-1">Medical Declaration</h3>
                  <textarea placeholder="Enter details (optional)" value={formData.medicalDetails} onChange={(e) => setFormData({...formData, medicalDetails: e.target.value})} className="w-full min-h-[80px] sm:min-h-[100px] bg-white dark:bg-slate-900 rounded-md p-3 text-sm border-transparent resize-none text-black dark:text-white" />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.medicalConfirm} onChange={(e) => setFormData({...formData, medicalConfirm: e.target.checked})} className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-300 text-[#2c3f67]" />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-tight">I confirm that the information provided is true.</span>
                </label>
                
                <div className="mt-auto pt-4 bg-[#e9ecef] dark:bg-slate-900 rounded-lg p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs font-bold text-[#2c3f67] dark:text-gray-400 mb-2">Guardian information (under 18)</p>
                  <button type="button" onClick={() => setShowGuardian(!showGuardian)} className="w-full h-9 sm:h-10 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-xs sm:text-sm font-medium flex items-center justify-between px-3 sm:px-4">
                    <span>{showGuardian ? 'Hide' : 'Add Guardian Info'}</span>
                    {showGuardian ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
                  </button>
                  {showGuardian && (
                    <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                       <Input placeholder="Guardian Name" value={formData.guardianName} onChange={(e) => setFormData({...formData, guardianName: e.target.value})} className="h-9 sm:h-10 bg-white border-transparent text-sm" />
                       <Input 
                         placeholder="Guardian NRIC / FIN" 
                         value={formData.guardianNric} 
                         onChange={(e) => setFormData({...formData, guardianNric: e.target.value.toUpperCase()})} 
                         className="h-9 sm:h-10 bg-white border-transparent text-sm uppercase" 
                       />
                       <Input 
                         type="tel" 
                         maxLength={8}
                         placeholder="Guardian Phone (8 digits)" 
                         value={formData.guardianPhone} 
                         onChange={(e) => setFormData({...formData, guardianPhone: formatPhone(e.target.value)})} 
                         className="h-9 sm:h-10 bg-white border-transparent text-sm" 
                       />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4 */}
        {currentStep === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[#2c3f67] dark:text-white mb-1 sm:mb-2">Review & Submit</h2>
              <p className="text-gray-500 text-xs sm:text-sm mb-4 sm:mb-6">Please review your information before submitting.</p>
              
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                <div className="flex justify-between items-center mb-3 sm:mb-4 border-b border-gray-200 dark:border-slate-700 pb-2 sm:pb-3">
                  <h3 className="text-sm sm:text-lg font-bold text-[#2c3f67] dark:text-blue-400">Personal Info</h3>
                  <button onClick={() => setCurrentStep(1)} className="text-xs sm:text-sm text-[#e62128] font-semibold hover:underline">Edit</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-3 text-xs sm:text-sm">
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Full Name</span>{formData.fullName || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">NRIC</span>{formData.nric || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Nationality</span>{formData.nationality || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">DOB</span>{formData.dob || '-'}</div>
                </div>
              </div>

              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                <div className="flex justify-between items-center mb-3 sm:mb-4 border-b border-gray-200 dark:border-slate-700 pb-2 sm:pb-3">
                  <h3 className="text-sm sm:text-lg font-bold text-[#2c3f67] dark:text-blue-400">Training & Emergency</h3>
                  <button onClick={() => setCurrentStep(2)} className="text-xs sm:text-sm text-[#e62128] font-semibold hover:underline">Edit</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 sm:gap-y-3 text-xs sm:text-sm">
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Dojo</span>{formData.principalDojo || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Type</span>{formData.membershipType || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Belt</span>{formData.currentBelt || '-'}</div>
                  <div><span className="text-gray-500 block text-[10px] sm:text-xs">Emergency Contact</span>{formData.emergencyName || '-'}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg">
              <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
                <input type="checkbox" checked={isDeclared} onChange={(e) => setIsDeclared(e.target.checked)} className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-300 text-[#2c3f67]" />
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  I declare that all the information provided is true.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* 底部按钮 */}
        <div className="mt-8 sm:mt-10 flex justify-between items-center border-t border-gray-100 dark:border-slate-800 pt-4 sm:pt-6">
          {currentStep > 1 ? (
            <Button onClick={handleBack} disabled={isSubmitting} className="bg-gray-400 hover:bg-gray-500 text-white px-6 sm:px-10 h-10 sm:h-12 rounded-md text-sm sm:text-base">
              Back
            </Button>
          ) : <div />}
          
          <Button onClick={handleNext} disabled={isSubmitting} className="bg-[#2c3f67] hover:bg-[#1f2d4a] text-white px-6 sm:px-10 h-10 sm:h-12 rounded-md text-sm sm:text-base">
            {isSubmitting ? 'Processing...' : (currentStep === 4 ? 'Submit' : 'Next')}
          </Button>
        </div>

      </div>
    </div>
  )
}