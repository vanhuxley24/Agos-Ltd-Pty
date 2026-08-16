import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: "neo-btn text-slate-700 hover:text-slate-900",
        primary: "neo-btn-primary text-white",
        secondary: "neo-flat-sm text-slate-700 hover:text-slate-900",
        outline: "bg-transparent border border-slate-300/80 text-slate-700 hover:bg-white/40 shadow-xs",
        ghost: "hover:bg-slate-200/50 text-slate-600 hover:text-slate-900",
        destructive: "neo-btn-red text-white",
        orange: "neo-btn-orange text-white",
        inset: "neo-inset text-slate-800",
        link: "text-blue-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-3.5 text-xs sm:text-sm rounded-lg",
        xs: "h-6 gap-1 px-2 text-[11px] rounded-md [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-2.5 text-xs rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 text-sm sm:text-base rounded-lg [&_svg:not([class*='size-'])]:size-5",
        icon: "size-9 rounded-lg p-0 flex items-center justify-center",
        "icon-xs": "size-6 rounded-md p-0 flex items-center justify-center [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md p-0 flex items-center justify-center",
        "icon-lg": "size-10 rounded-lg p-0 flex items-center justify-center [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
