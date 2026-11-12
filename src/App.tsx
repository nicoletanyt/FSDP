import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import { GuestRoute, InstructorIndexRedirect, ProtectedRoute } from '@/components/auth/AuthGate'
import FaqChatbot from '@/components/FaqChatbot'
import NfcTagCapture from '@/components/instructor/NfcTagCapture'
import AuthLayout from './layouts/AuthLayout'
import RootLayout from './layouts/RootLayout'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import NotFound from './pages/NotFound'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const InstructorLayout = lazy(() => import('./layouts/InstructorLayout'))
const StudentLayout = lazy(() => import('./layouts/StudentLayout'))

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('./pages/admin/Overview'))
const AdminCentres = lazy(() => import('./pages/admin/Centres'))
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail'))
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'))
const AdminAttendanceRegister = lazy(() => import('./pages/admin/LiveAttendanceRegister'))
const AdminAttendanceRecords = lazy(() => import('./pages/admin/AttendanceRecords'))
const AdminAttendanceMonitoring = lazy(() => import('./pages/admin/AttendanceMonitoring'))
const AdminGrading = lazy(() => import('./pages/admin/Grading'))
const AdminGradingEligibility = lazy(() => import('./pages/admin/GradingEligibility'))
const AdminGradingOpportunities = lazy(() => import('./pages/admin/GradingOpportunities'))
const AdminGradingApplications = lazy(() => import('./pages/admin/GradingApplications'))
const AdminGradingSyllabus = lazy(() => import('./pages/admin/Syllabus'))
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'))
const AdminInstructors = lazy(() => import('./pages/admin/Instructors'))
const AdminEmailTemplates = lazy(() => import('./pages/admin/EmailTemplates'))
const AdminProfile = lazy(() => import('./pages/admin/Profile'))

const ForgetPassword = lazy(() => import('./pages/ForgetPassword')) 
const ApplyMembership = lazy(() => import('./pages/Student/ApplyMembership'))
const ApplicationSuccess = lazy(() => import('./pages/Student/ApplicationSuccess'))

const StudentDashboard = lazy(() => import('./pages/Student/StudentDashboard'))
const StudentClasses = lazy(() => import('./pages/StudentClasses'))
const StudentAttendance = lazy(() => import('./pages/StudentAttendance'))
const StudentProfile = lazy(() => import('./pages/Student/StudentProfile'))
const StudentPayments = lazy(() => import('./pages/Student/StudentPayments'))
const StudentCredits = lazy(() => import('./pages/Student/StudentCredits'))
const StudentGrading = lazy(() => import('./pages/Student/StudentGrading'))
const GradingRequirements = lazy(() => import('./pages/Student/GradingRequirements'))

const InstructorDashboard = lazy(() => import('./pages/Instructor/InstructorDashboard'))
const InstructorStudents = lazy(() => import('./pages/Instructor/InstructorStudents'))
const InstructorProfile = lazy(() => import('./pages/Instructor/InstructorProfile'))
const InstructorCheckIn = lazy(() => import('./pages/Instructor/InstructorCheckIn'))
const NfcCheckIn = lazy(() => import('./pages/Instructor/NfcCheckIn'))
const InstructorStudentDetails = lazy(() => import('./pages/Instructor/InstructorStudentDetails'))
const InstructorGradingSession = lazy(() => import('./pages/Instructor/InstructorGradingSession'))
const InstructorGradings = lazy(() => import('./pages/Instructor/InstructorGradings'))
const InstructorGradingDay = lazy(() => import('./pages/Instructor/InstructorGradingDay'))

function LegacyCoverInvitationRedirect() {
  const { invitationId } = useParams()
  return <Navigate to={`/instructor/calendar?cover=${encodeURIComponent(invitationId ?? '')}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<Navigate to="/instructor" replace />} />
          <Route element={<GuestRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="staff/login" element={<Login staff />} />
              <Route path="forgot-password" element={<ForgetPassword />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute role="student" />}>
            <Route element={<StudentLayout />}>
              <Route path="apply-membership" element={<ApplyMembership />} />
              <Route path="apply-membership/success" element={<ApplicationSuccess />} /> 
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="classes" element={<StudentClasses />} />
              <Route path="timetable" element={<StudentAttendance />} />
              <Route path="profile" element={<StudentProfile />} />
              <Route path="payments" element={<StudentPayments />} />
              <Route path="student/credits" element={<StudentCredits />} />
              <Route path="grading" element={<StudentGrading />} />
              <Route path="grading/requirements" element={<GradingRequirements />} />
            </Route>
          </Route>
          <Route path="instructor" element={<NfcTagCapture />}>
            <Route index element={<InstructorIndexRedirect />} />
            <Route element={<GuestRoute />}>
              <Route element={<AuthLayout />}>
                <Route path="signin" element={<Login staff />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute role="instructor" />}>
              <Route element={<InstructorLayout />}>
                <Route path="dashboard" element={<InstructorDashboard />} />
                <Route path="calendar" element={<InstructorDashboard />} />
                <Route path="students" element={<InstructorStudents />} />
                <Route path="check-in" element={<InstructorCheckIn />} />
                <Route path="cover/:invitationId" element={<LegacyCoverInvitationRedirect />} />
                <Route path="nfc_checkin" element={<NfcCheckIn />} />
                <Route path="students/:studentId" element={<InstructorStudentDetails />} />
                <Route path="reports/:eventId" element={<Navigate to="/instructor/calendar" replace />} />
                <Route path="gradings" element={<InstructorGradings />} />
                <Route path="gradings/:eventId" element={<InstructorGradingDay />} />
                <Route path="grading/:eventId" element={<InstructorGradingSession />} />
                <Route path="profile" element={<InstructorProfile />} />
              </Route>
            </Route>
          </Route>
          <Route element={<ProtectedRoute role="administrator" />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              // is rerouting students to centres really needed?
              <Route path="students" element={<Navigate to="/admin/centres" replace />} />
              <Route path="students/:studentId" element={<AdminStudentDetail />} />
              <Route path="centres" element={<AdminCentres />} />
              <Route path="calendar" element={<AdminAttendance />}>
                <Route index element={<AdminAttendanceRegister />} />
                <Route path="records" element={<AdminAttendanceRecords />} />
                <Route path="monitoring" element={<AdminAttendanceMonitoring />} />
              </Route>
              <Route path="grading" element={<AdminGrading />}>
                <Route index element={<Navigate to="opportunities" replace />} />
                <Route path="eligibility" element={<AdminGradingEligibility />} />
                <Route path="opportunities" element={<AdminGradingOpportunities />} />
                <Route path="applications" element={<AdminGradingApplications />} />
                <Route path="syllabus" element={<AdminGradingSyllabus />} />
              </Route>
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="instructors" element={<AdminInstructors />} />
              <Route path="email-templates" element={<AdminEmailTemplates />} />
              <Route path="profile" element={<AdminProfile />} />
            </Route>
          </Route>
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="checkout/cancel" element={<CheckoutCancel />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <FaqChatbot />
    </BrowserRouter>
  )
}
