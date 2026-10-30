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
const InstructorDashboard = lazy(() => import('./pages/InstructorDashboard'))
const InstructorStudents = lazy(() => import('./pages/InstructorStudents'))
const InstructorProfile = lazy(() => import('./pages/InstructorProfile'))
const InstructorCheckIn = lazy(() => import('./pages/InstructorCheckIn'))
const InstructorStudentDetails = lazy(() => import('./pages/InstructorStudentDetails'))
const InstructorStudentReports = lazy(() => import('./pages/InstructorStudentReports'))
const InstructorGradingAssessment = lazy(() => import('./pages/InstructorGradingAssessment'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

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
            <Route path="admin" element={<AdminDashboard />} />
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
