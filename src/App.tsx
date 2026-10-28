import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { GuestRoute, ProtectedRoute } from '@/components/auth/AuthGate'
import AuthLayout from './layouts/AuthLayout'
import RootLayout from './layouts/RootLayout'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const InstructorDashboard = lazy(() => import('./pages/InstructorDashboard'))

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('./pages/admin/Overview'))
const AdminCentres = lazy(() => import('./pages/admin/Centres'))
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail'))
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'))
const AdminAttendanceRegister = lazy(() => import('./pages/admin/AttendanceRegister'))
const AdminAttendanceSessions = lazy(() => import('./pages/admin/AttendanceSessions'))
const AdminAttendanceRecords = lazy(() => import('./pages/admin/AttendanceRecords'))
const AdminAttendanceMonitoring = lazy(() => import('./pages/admin/AttendanceMonitoring'))
const AdminGrading = lazy(() => import('./pages/admin/Grading'))
const AdminGradingEligibility = lazy(() => import('./pages/admin/GradingEligibility'))
const AdminGradingOpportunities = lazy(() => import('./pages/admin/GradingOpportunities'))
const AdminGradingApplications = lazy(() => import('./pages/admin/GradingApplications'))
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'))
const AdminInstructors = lazy(() => import('./pages/admin/Instructors'))
const AdminReports = lazy(() => import('./pages/admin/Reports'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<Home />} />
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
          <Route element={<ProtectedRoute role="instructor" />}>
            <Route path="instructor" element={<InstructorDashboard />} />
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
                <Route path="sessions" element={<AdminAttendanceSessions />} />
                <Route path="records" element={<AdminAttendanceRecords />} />
                <Route path="monitoring" element={<AdminAttendanceMonitoring />} />
              </Route>
              <Route path="grading" element={<AdminGrading />}>
                <Route index element={<Navigate to="eligibility" replace />} />
                <Route path="eligibility" element={<AdminGradingEligibility />} />
                <Route path="opportunities" element={<AdminGradingOpportunities />} />
                <Route path="applications" element={<AdminGradingApplications />} />
              </Route>
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="instructors" element={<AdminInstructors />} />
              <Route path="reports" element={<AdminReports />} />
            </Route>
          </Route>
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="checkout/cancel" element={<CheckoutCancel />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
