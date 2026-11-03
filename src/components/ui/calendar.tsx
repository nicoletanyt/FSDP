import type { ComponentProps } from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8",
          defaultClassNames.month_caption,
        ),
        caption_label: cn("text-sm font-medium", defaultClassNames.caption_label),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 p-0",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 p-0",
          defaultClassNames.button_next,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weeks: cn("flex flex-col", defaultClassNames.weeks),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-8 rounded-md text-center text-[0.7rem] font-normal text-muted-foreground",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 flex w-full", defaultClassNames.week),
        day: cn("size-8 p-0 text-center text-sm", defaultClassNames.day),
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-8 rounded-md p-0 font-normal",
          defaultClassNames.day_button,
        ),
        selected: cn(
          "rounded-md bg-primary text-primary-foreground [&_button:hover]:bg-transparent [&_button:hover]:text-primary-foreground",
          defaultClassNames.selected,
        ),
        today: cn("font-semibold", defaultClassNames.today),
        outside: cn("text-muted-foreground/50", defaultClassNames.outside),
        disabled: cn("text-muted-foreground/40 opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeftIcon
              className={cn("size-4", chevronClassName)}
              {...chevronProps}
            />
          ) : (
            <ChevronRightIcon
              className={cn("size-4", chevronClassName)}
              {...chevronProps}
            />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
