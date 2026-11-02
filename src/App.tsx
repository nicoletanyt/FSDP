import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { GuestRoute, InstructorIndexRedirect, ProtectedRoute } from '@/components/auth/AuthGate'
import FloatingChatbot from '@/components/FloatingChatbot'
import AuthLayout from './layouts/AuthLayout'
import RootLayout from './layouts/RootLayout'
import InstructorLayout from './layouts/InstructorLayout'
import StudentLayout from './layouts/StudentLayout'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import NotFound from './pages/NotFound'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgetPassword = lazy(() => import('./pages/ForgetPassword')) 
const ApplyMembership = lazy(() => import('./pages/Student/ApplyMembership'))
const ApplicationSuccess = lazy(() => import('./pages/Student/ApplicationSuccess'))
const StudentDashboard = lazy(() => import('./pages/Student/StudentDashboard'))
const StudentClasses = lazy(() => import('./pages/StudentClasses'))
const StudentAttendance = lazy(() => import('./pages/StudentAttendance'))
const StudentProfile = lazy(() => import('./pages/Student/StudentProfile'))
const StudentPayments = lazy(() => import('./pages/Student/StudentPayments'))
const StudentGrading = lazy(() => import('./pages/Student/StudentGrading'))
const InstructorDashboard = lazy(() => import('./pages/Instructor/InstructorDashboard'))
const InstructorStudents = lazy(() => import('./pages/Instructor/InstructorStudents'))
const InstructorProfile = lazy(() => import('./pages/Instructor/InstructorProfile'))
const InstructorCheckIn = lazy(() => import('./pages/Instructor/InstructorCheckIn'))
const InstructorStudentDetails = lazy(() => import('./pages/Instructor/InstructorStudentDetails'))
const InstructorStudentReports = lazy(() => import('./pages/Instructor/InstructorStudentReports'))
const InstructorGradingAssessment = lazy(() => import('./pages/Instructor/InstructorGradingAssessment'))
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
              <Route path="forgot-password" element={<ForgetPassword />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute role="student" />}>
            <Route element={<StudentLayout />}>
              <Route path="apply-membership" element={<ApplyMembership />} />
              <Route path="apply-membership/success" element={<ApplicationSuccess />} /> 
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="timetable" element={<StudentClasses />} />
              <Route path="classes" element={<StudentClasses />} />
              <Route path="attendance" element={<StudentAttendance />} />
              <Route path="profile" element={<StudentProfile />} />
              <Route path="payments" element={<StudentPayments />} />
              <Route path="grading" element={<StudentGrading />} />
            </Route>
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
