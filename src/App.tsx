import { BrowserRouter, Route, Routes } from 'react-router'
import RootLayout from './layouts/RootLayout'
import CheckoutCancel from './pages/CheckoutCancel'
import CheckoutSuccess from './pages/CheckoutSuccess'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<Home />} />
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="checkout/cancel" element={<CheckoutCancel />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
