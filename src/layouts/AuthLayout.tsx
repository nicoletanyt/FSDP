import { Outlet, useMatch } from 'react-router'

export default function AuthLayout() {
  return (
    <div className={`mx-auto flex min-h-[50vh] w-full max-w-md flex-col justify-center py-4 lg:min-h-[65vh] ${useMatch('/instructor/*') ? 'mb-24 px-4 lg:mb-0 lg:px-0' : ''}`}>
      <Outlet />
    </div>
  )
}
