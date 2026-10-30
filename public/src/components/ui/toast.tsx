import type { ReactNode } from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const useToast = ToastPrimitive.useToastManager

function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none">
        {toasts.map((toast) => (
          <ToastPrimitive.Root key={toast.id} toast={toast} data-slot="toast" className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-opacity data-ending:opacity-0 data-limited:hidden motion-reduce:transition-none">
            <ToastPrimitive.Content className="flex items-center gap-3">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <ToastPrimitive.Title className="flex-1 text-sm font-medium">{toast.title}</ToastPrimitive.Title>
              <ToastPrimitive.Close aria-label="Dismiss notification" render={<Button variant="ghost" size="icon-sm" />}>
                <X aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Content>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={3500} limit={1}>
      {children}
      <Toaster />
    </ToastPrimitive.Provider>
  )
}

export { ToastProvider, useToast }
