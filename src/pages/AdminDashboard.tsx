import Dashboard from '@/components/auth/Dashboard'
import CreateInstructorForm from '@/components/auth/CreateInstructorForm'

export default function AdminDashboard() {
  return (
    <Dashboard title="Administrator dashboard">
      <CreateInstructorForm />
    </Dashboard>
  )
}
