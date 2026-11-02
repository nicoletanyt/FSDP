import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { GuestRoute, InstructorIndexRedirect, ProtectedRoute } from '@/components/auth/AuthGate'
import FloatingChatbot from '@/components/FloatingChatbot'
import AuthLayout from './layouts/AuthLayout'
import RootLayout from './layouts/RootLayout'
import InstructorLayout from './layouts/InstructorLayout'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import NotFound from './pages/NotFound'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('./pages/admin/Overview'))
const AdminCentres = lazy(() => import('./pages/admin/Centres'))
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail'))
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'))
const AdminAttendanceRegister = lazy(() => import('./pages/admin/AttendanceRegister'))
const AdminAttendanceRecords = lazy(() => import('./pages/admin/AttendanceRecords'))
const AdminAttendanceMonitoring = lazy(() => import('./pages/admin/AttendanceMonitoring'))
const AdminGrading = lazy(() => import('./pages/admin/Grading'))
const AdminGradingEligibility = lazy(() => import('./pages/admin/GradingEligibility'))
const AdminGradingOpportunities = lazy(() => import('./pages/admin/GradingOpportunities'))
const AdminGradingApplications = lazy(() => import('./pages/admin/GradingApplications'))
const AdminGradingSyllabus = lazy(() => import('./pages/admin/Syllabus'))
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'))
const AdminInstructors = lazy(() => import('./pages/admin/Instructors'))
const AdminProfile = lazy(() => import('./pages/admin/Profile'))
const AdminReports = lazy(() => import('./pages/admin/Reports'))

const InstructorDashboard = lazy(() => import('./pages/Instructor/InstructorDashboard'))
const InstructorStudents = lazy(() => import('./pages/Instructor/InstructorStudents'))
const InstructorProfile = lazy(() => import('./pages/Instructor/InstructorProfile'))
const InstructorCheckIn = lazy(() => import('./pages/Instructor/InstructorCheckIn'))
const InstructorStudentDetails = lazy(() => import('./pages/Instructor/InstructorStudentDetails'))
const InstructorStudentReports = lazy(() => import('./pages/Instructor/InstructorStudentReports'))
const InstructorGradingAssessment = lazy(() => import('./pages/Instructor/InstructorGradingAssessment'))

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
            </Route>
          </Route>
          <Route element={<ProtectedRoute role="student" />}>
            <Route path="dashboard" element={<StudentDashboard />} />
          </Route>
          <Route path="instructor">
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
                <Route path="students/:studentId" element={<InstructorStudentDetails />} />
                <Route path="reports/:eventId" element={<InstructorStudentReports />} />
                <Route path="assessments/:assessmentId" element={<InstructorGradingAssessment />} />
                <Route path="assessments/:eventId/:studentId" element={<InstructorGradingAssessment />} />
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
              <Route path="attendance" element={<AdminAttendance />}>
                <Route index element={<Navigate to="register" replace />} />
                <Route path="register" element={<AdminAttendanceRegister />} />
                <Route path="sessions" element={<Navigate to="/admin/attendance/register?view=list" replace />} />
                <Route path="records" element={<AdminAttendanceRecords />} />
                <Route path="monitoring" element={<AdminAttendanceMonitoring />} />
              </Route>
              <Route path="grading" element={<AdminGrading />}>
                <Route index element={<Navigate to="eligibility" replace />} />
                <Route path="eligibility" element={<AdminGradingEligibility />} />
                <Route path="opportunities" element={<AdminGradingOpportunities />} />
                <Route path="applications" element={<AdminGradingApplications />} />
                <Route path="syllabus" element={<AdminGradingSyllabus />} />
              </Route>
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="instructors" element={<AdminInstructors />} />
              <Route path="profile" element={<AdminProfile />} />
              <Route path="reports" element={<AdminReports />} />
            </Route>
          </Route>
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="checkout/cancel" element={<CheckoutCancel />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <FloatingChatbot />
    </BrowserRouter>
  )
}
