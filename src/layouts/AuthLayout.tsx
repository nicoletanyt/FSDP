import { Outlet } from 'react-router'

export default function AuthLayout() {
  return (
    <div className="mx-auto flex min-h-[65vh] w-full max-w-md flex-col justify-center py-4">
      <Outlet />
    </div>
  )
}
