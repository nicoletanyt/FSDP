import { useState } from 'react'
import { useNavigate } from 'react-router' 
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, ChevronDown, ChevronUp, UploadCloud } from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Personal\nInformation' },
  { id: 2, title: 'Training\nInformation' },
  { id: 3, title: 'Emergency\nContact' },
  { id: 4, title: 'Review &\nSubmit' },
]

export default function ApplyMembership() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [showGuardian, setShowGuardian] = useState(false)

  const [formData, setFormData] = useState({
    // Step 1
    fullName: '',
    nric: '',
    nationality: '',
    dob: '',
    gender: '',
    email: 'student@example.com', // 默认填一个，实际开发中这里应通过 useEffect 获取当前登录用户的邮箱
    mobile: '',
    address: '',
    photoName: '', // 用于展示上传的文件名
    // Step 2
    principalDojo: '',
    membershipType: '',
    currentBelt: '',
    hasExperience: 'no',
    experienceDetails: '',
    // Step 3
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    medicalDetails: '',
    medicalConfirm: false,
    guardianName: '',
    guardianNric: '',
    guardianRelationship: '',
    guardianPhone: '',
  })

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    } else {
      // TODO: 提交给 Supabase
      navigate('/apply-membership/success') 
    }
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  // 模拟照片上传
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData({ ...formData, photoName: file.name })
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#f4f5f7] dark:bg-slate-950 py-10 px-4 sm:px-8 transition-colors">
      <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-none p-8 sm:p-12 transition-colors">
        
        {/* 进度条 */}
        <div className="mb-12 flex items-start justify-between relative max-w-3xl mx-auto">
          <div className="absolute top-5 left-0 w-full h-[2px] bg-gray-200 dark:bg-slate-700 -z-10" />
          
          {STEPS.map((step) => (
            <div key={step.id} className="flex flex-col items-center relative z-10 w-24">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-3 transition-colors ${
                  currentStep === step.id 
                    ? 'bg-[#2c3f67] dark:bg-blue-600 text-white' 
                    : currentStep > step.id
                      ? 'bg-[#2c3f67] dark:bg-blue-600 text-white'
                      : 'bg-gray-300 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {currentStep > step.id ? <Check className="w-5 h-5" /> : step.id}
              </div>
              <span className={`text-xs text-center whitespace-pre-line font-medium transition-colors ${
                currentStep >= step.id ? 'text-[#2c3f67] dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'
              }`}>
                {step.title}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Personal Information */}
        {currentStep === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2c3f67] dark:text-white mb-2 transition-colors">Personal Information</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Please fill in your personal details to create your membership profile</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Full Name</Label>
                <Input 
                  placeholder="Enter your full name" 
                  className="h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">NRIC / FIN</Label>
                <Input 
                  placeholder="e.g. S1234567A" 
                  className="h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                  value={formData.nric}
                  onChange={(e) => setFormData({...formData, nric: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Nationality</Label>
                <select 
                  className="w-full h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                  value={formData.nationality}
                  onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                >
                  <option value="" disabled>Select nationality</option>
                  <option value="singaporean">Singaporean</option>
                  <option value="pr">Singapore PR</option>
                  <option value="foreigner">Foreigner</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Date of Birth</Label>
                <Input 
                  type="date"
                  className="h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent dark:border-slate-700 text-gray-500 dark:text-gray-400 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                  value={formData.dob}
                  onChange={(e) => setFormData({...formData, dob: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Gender</Label>
                <select 
                  className="w-full h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                >
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Email Address</Label>
                <Input 
                  type="email"
                  className="h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors opacity-70 cursor-not-allowed"
                  value={formData.email}
                  disabled
                  readOnly
                />
                <p className="text-xs text-gray-500">Linked to your login account.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Mobile Number</Label>
                <div className="flex gap-2">
                  <div className="w-24 h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 border border-transparent dark:border-slate-700 transition-colors">
                    +65
                  </div>
                  <Input 
                    placeholder="Enter mobile number" 
                    className="flex-1 h-12 bg-gray-200/60 dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                    value={formData.mobile}
                    onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Residential Address</Label>
                <textarea 
                  placeholder="Enter your residential address" 
                  className="w-full min-h-[100px] bg-gray-200/60 dark:bg-slate-800 rounded-md p-3 text-sm border-transparent dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 resize-none transition-colors"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                />
              </div>

              {/* 照片上传占位 */}
              <div className="space-y-2 md:col-span-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Profile Photo (2 photos required for registration)</Label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl cursor-pointer bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-gray-500 dark:text-gray-400">
                    <UploadCloud className="w-8 h-8 mb-2" />
                    <p className="text-sm"><span className="font-semibold text-[#2c3f67] dark:text-blue-400">Click to upload</span> or drag and drop</p>
                    <p className="text-xs mt-1">JPG, PNG (MAX. 2MB)</p>
                    {formData.photoName && <p className="text-xs text-green-600 dark:text-green-400 font-bold mt-2">Selected: {formData.photoName}</p>}
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Training Information */}
        {currentStep === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2c3f67] dark:text-white mb-2 transition-colors">Training Information</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Tell us about your training background and preferred dojo</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Principal Dojo / Training Centre</Label>
                <select 
                  className="w-full h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                  value={formData.principalDojo}
                  onChange={(e) => setFormData({...formData, principalDojo: e.target.value})}
                >
                  <option value="" disabled>Select your principal dojo</option>
                  <option value="central">Central Dojo</option>
                  <option value="east">East Dojo</option>
                  <option value="west">West Dojo</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Membership Type</Label>
                <select 
                  className="w-full h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                  value={formData.membershipType}
                  onChange={(e) => setFormData({...formData, membershipType: e.target.value})}
                >
                  <option value="" disabled>Select membership type</option>
                  <option value="adult">Adult</option>
                  <option value="student">Student</option>
                  <option value="junior">Junior</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Current Belt Rank</Label>
                <select 
                  className="w-full h-12 bg-gray-200/60 dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                  value={formData.currentBelt}
                  onChange={(e) => setFormData({...formData, currentBelt: e.target.value})}
                >
                  <option value="" disabled>Select your current belt</option>
                  <option value="white">White Belt</option>
                  <option value="yellow">Yellow Belt</option>
                  <option value="orange">Orange Belt</option>
                  <option value="green">Green Belt</option>
                  <option value="blue">Blue Belt</option>
                  <option value="brown">Brown Belt</option>
                  <option value="black">Black Belt</option>
                </select>
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-base transition-colors">Previous Aikido Experience</Label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="experience" 
                      value="yes"
                      checked={formData.hasExperience === 'yes'}
                      onChange={(e) => setFormData({...formData, hasExperience: e.target.value})}
                      className="w-5 h-5 text-[#2c3f67] dark:text-blue-600 focus:ring-[#2c3f67] dark:focus:ring-blue-600 dark:bg-slate-800 dark:border-slate-600"
                    />
                    <span className="text-sm font-medium dark:text-gray-300 transition-colors">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="experience" 
                      value="no"
                      checked={formData.hasExperience === 'no'}
                      onChange={(e) => setFormData({...formData, hasExperience: e.target.value})}
                      className="w-5 h-5 text-[#2c3f67] dark:text-blue-600 focus:ring-[#2c3f67] dark:focus:ring-blue-600 dark:bg-slate-800 dark:border-slate-600"
                    />
                    <span className="text-sm font-medium dark:text-gray-300 transition-colors">No</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-gray-700 dark:text-gray-400 text-sm font-medium transition-colors">If yes, please provide details</Label>
                <textarea 
                  placeholder="Enter details here (optional)" 
                  className="w-full min-h-[120px] bg-gray-200/60 dark:bg-slate-800 rounded-md p-3 text-sm border-transparent dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 resize-none disabled:opacity-50 transition-colors"
                  value={formData.experienceDetails}
                  onChange={(e) => setFormData({...formData, experienceDetails: e.target.value})}
                  disabled={formData.hasExperience === 'no'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Emergency Contact & Medical */}
        {currentStep === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2c3f67] dark:text-white mb-2 transition-colors">Emergency Contact & Medical Declaration</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Please provide an emergency contact and complete the medical declaration</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 p-6 rounded-xl space-y-5 transition-colors">
                <h3 className="text-lg font-bold text-[#2c3f67] dark:text-blue-400 mb-2 transition-colors">Emergency Contact</h3>
                
                <div className="space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm transition-colors">Full Name</Label>
                  <Input 
                    placeholder="Enter emergency contact name" 
                    className="h-12 bg-white dark:bg-slate-900 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                    value={formData.emergencyName}
                    onChange={(e) => setFormData({...formData, emergencyName: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm transition-colors">Relationship</Label>
                  <select 
                    className="w-full h-12 bg-white dark:bg-slate-900 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                    value={formData.emergencyRelationship}
                    onChange={(e) => setFormData({...formData, emergencyRelationship: e.target.value})}
                  >
                    <option value="" disabled>Select relationship</option>
                    <option value="parent">Parent</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#2c3f67] dark:text-gray-300 font-bold text-sm transition-colors">Contact Number</Label>
                  <div className="flex gap-2">
                    <div className="w-24 h-12 bg-white dark:bg-slate-900 rounded-md flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 border border-transparent dark:border-slate-700 transition-colors">
                      +65
                    </div>
                    <Input 
                      placeholder="Enter mobile number" 
                      className="flex-1 h-12 bg-white dark:bg-slate-900 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                      value={formData.emergencyPhone}
                      onChange={(e) => setFormData({...formData, emergencyPhone: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 p-6 rounded-xl space-y-5 flex flex-col transition-colors">
                <div>
                  <h3 className="text-lg font-bold text-[#2c3f67] dark:text-blue-400 mb-1 transition-colors">Medical Declaration</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 transition-colors">Please indicate if you have any relevant medical conditions (e.g. allergies, asthma).</p>
                  
                  <textarea 
                    placeholder="Enter details here (optional)" 
                    className="w-full min-h-[100px] bg-white dark:bg-slate-900 rounded-md p-3 text-sm border-transparent dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 resize-none transition-colors"
                    value={formData.medicalDetails}
                    onChange={(e) => setFormData({...formData, medicalDetails: e.target.value})}
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="mt-1 w-5 h-5 rounded border-gray-300 dark:border-slate-600 text-[#2c3f67] dark:text-blue-600 focus:ring-[#2c3f67] dark:focus:ring-blue-600 dark:bg-slate-900 transition-colors"
                    checked={formData.medicalConfirm}
                    onChange={(e) => setFormData({...formData, medicalConfirm: e.target.checked})}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight transition-colors">
                    I confirm that the information provided is true and accurate to the best of my knowledge.
                  </span>
                </label>

                <div className="mt-auto pt-4 bg-[#e9ecef] dark:bg-slate-900 rounded-lg p-4 transition-colors">
                  <p className="text-xs font-bold text-[#2c3f67] dark:text-gray-400 mb-2 transition-colors">Guardian information (for members under 18)</p>
                  
                  <button 
                    type="button"
                    onClick={() => setShowGuardian(!showGuardian)}
                    className="w-full h-10 bg-gray-500 dark:bg-slate-700 hover:bg-gray-600 dark:hover:bg-slate-600 text-white rounded-md text-sm font-medium flex items-center justify-between px-4 transition-colors"
                  >
                    <span>{showGuardian ? 'Hide Guardian Information' : 'Add Guardian Information'}</span>
                    {showGuardian ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showGuardian && (
                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                      <div className="space-y-1">
                        <Label className="text-gray-700 dark:text-gray-400 text-xs font-medium transition-colors">Guardian Full Name</Label>
                        <Input 
                          placeholder="Enter guardian name" 
                          className="h-10 bg-white dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                          value={formData.guardianName}
                          onChange={(e) => setFormData({...formData, guardianName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-700 dark:text-gray-400 text-xs font-medium transition-colors">Guardian NRIC</Label>
                        <Input 
                          placeholder="e.g. S1234567A" 
                          className="h-10 bg-white dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                          value={formData.guardianNric}
                          onChange={(e) => setFormData({...formData, guardianNric: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-700 dark:text-gray-400 text-xs font-medium transition-colors">Relationship to Member</Label>
                        <select 
                          className="w-full h-10 bg-white dark:bg-slate-800 rounded-md border-transparent dark:border-slate-700 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2c3f67] dark:focus:ring-blue-500 text-gray-600 dark:text-gray-300 transition-colors"
                          value={formData.guardianRelationship}
                          onChange={(e) => setFormData({...formData, guardianRelationship: e.target.value})}
                        >
                          <option value="" disabled>Select relationship</option>
                          <option value="parent">Parent</option>
                          <option value="legal-guardian">Legal Guardian</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-700 dark:text-gray-400 text-xs font-medium transition-colors">Guardian Contact Number</Label>
                        <Input 
                          placeholder="Enter contact number" 
                          className="h-10 bg-white dark:bg-slate-800 border-transparent dark:border-slate-700 focus-visible:ring-[#2c3f67] dark:focus-visible:ring-blue-500 transition-colors"
                          value={formData.guardianPhone}
                          onChange={(e) => setFormData({...formData, guardianPhone: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Submit */}
        {currentStep === 4 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2c3f67] dark:text-white mb-2 transition-colors">Review & Submit</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Please review your information carefully before submitting your application.</p>
            </div>

            <div className="space-y-6">
              {/* 1. Personal Information */}
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 rounded-xl p-6 relative transition-colors">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-slate-700 pb-3 transition-colors">
                  <h3 className="text-lg font-bold text-[#2c3f67] dark:text-blue-400 transition-colors">Personal Information</h3>
                  <button onClick={() => setCurrentStep(1)} className="text-sm text-[#e62128] dark:text-red-400 font-semibold hover:underline transition-colors">Edit</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Full Name</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.fullName || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">NRIC / FIN</span><span className="font-medium text-gray-900 dark:text-gray-100 uppercase transition-colors">{formData.nric || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Nationality</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.nationality || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Date of Birth</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.dob || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Gender</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.gender || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Email Address</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.email || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Mobile Number</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">+65 {formData.mobile || '-'}</span></div>
                  <div className="sm:col-span-2"><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Residential Address</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.address || '-'}</span></div>
                  <div className="sm:col-span-2"><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Profile Photo</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.photoName || 'Not uploaded'}</span></div>
                </div>
              </div>

              {/* 2. Training Information */}
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 rounded-xl p-6 relative transition-colors">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-slate-700 pb-3 transition-colors">
                  <h3 className="text-lg font-bold text-[#2c3f67] dark:text-blue-400 transition-colors">Training Information</h3>
                  <button onClick={() => setCurrentStep(2)} className="text-sm text-[#e62128] dark:text-red-400 font-semibold hover:underline transition-colors">Edit</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Principal Dojo</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.principalDojo || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Membership Type</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.membershipType || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Current Belt Rank</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.currentBelt || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Previous Experience</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.hasExperience}</span></div>
                  {formData.hasExperience === 'yes' && (
                    <div className="sm:col-span-2"><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Experience Details</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.experienceDetails || 'No details provided'}</span></div>
                  )}
                </div>
              </div>

              {/* 3. Emergency & Medical */}
              <div className="bg-[#f4f5f7] dark:bg-slate-800/50 rounded-xl p-6 relative transition-colors">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-slate-700 pb-3 transition-colors">
                  <h3 className="text-lg font-bold text-[#2c3f67] dark:text-blue-400 transition-colors">Emergency & Medical</h3>
                  <button onClick={() => setCurrentStep(3)} className="text-sm text-[#e62128] dark:text-red-400 font-semibold hover:underline transition-colors">Edit</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Emergency Contact</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.emergencyName || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Relationship</span><span className="font-medium text-gray-900 dark:text-gray-100 capitalize transition-colors">{formData.emergencyRelationship || '-'}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Contact Number</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">+65 {formData.emergencyPhone || '-'}</span></div>
                  <div className="sm:col-span-2"><span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Medical Conditions</span><span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">{formData.medicalDetails || 'None declared'}</span></div>
                  {formData.guardianName && (
                    <div className="sm:col-span-2 pt-2 mt-2 border-t border-gray-200 dark:border-slate-700 transition-colors">
                      <span className="text-gray-500 dark:text-gray-400 block mb-1 transition-colors">Guardian Information</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 transition-colors">
                        {formData.guardianName} (NRIC: {formData.guardianNric || '-'}) - +65 {formData.guardianPhone}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg transition-colors">
              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  required
                  className="mt-1 w-5 h-5 rounded border-gray-300 dark:border-slate-600 text-[#2c3f67] dark:text-blue-600 focus:ring-[#2c3f67] dark:focus:ring-blue-600 dark:bg-slate-900 transition-colors"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed transition-colors">
                  I declare that all the information provided in this application is true, complete, and accurate. I understand that any false information may result in the rejection of my membership application.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="mt-10 flex justify-between items-center border-t border-gray-100 dark:border-slate-800 pt-6 transition-colors">
          {currentStep > 1 ? (
            <Button 
              onClick={handleBack}
              className="bg-gray-400 dark:bg-slate-700 hover:bg-gray-500 dark:hover:bg-slate-600 text-white px-10 h-12 rounded-md text-base transition-colors"
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          
          <Button 
            onClick={handleNext}
            className="bg-[#2c3f67] dark:bg-blue-600 hover:bg-[#1f2d4a] dark:hover:bg-blue-700 text-white px-10 h-12 rounded-md text-base transition-colors"
          >
            {currentStep === 4 ? 'Submit Application' : 'Next'}
          </Button>
        </div>

      </div>
    </div>
  )
}