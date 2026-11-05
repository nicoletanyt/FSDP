import type { ReactNode } from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const useToast = ToastPrimitive.useToastManager

function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none sm:bottom-[calc(6rem+env(safe-area-inset-bottom))]">
        {toasts.map((toast) => (
          <ToastPrimitive.Root key={toast.id} toast={toast} data-slot="toast" className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-opacity data-ending:opacity-0 data-limited:hidden motion-reduce:transition-none">
            <ToastPrimitive.Content className="flex items-center gap-3">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <ToastPrimitive.Title className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{toast.title}</ToastPrimitive.Title>
              <ToastPrimitive.Close aria-label="Dismiss notification" render={<Button variant="ghost" size="icon-sm" className="size-11 shrink-0 lg:size-8.75" />}>
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
