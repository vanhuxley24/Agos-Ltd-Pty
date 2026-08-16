import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-3 py-0.5 text-xs font-bold whitespace-nowrap transition-all select-none [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "neo-flat-sm text-blue-600 border border-white/80",
        primary: "bg-blue-600 text-white shadow-sm",
        secondary: "neo-inset-sm text-slate-700",
        orange: "neo-flat-sm text-orange-600 border border-orange-200/60",
        emerald: "neo-flat-sm text-emerald-600 border border-emerald-200/60",
        destructive: "neo-flat-sm text-rose-600 border border-rose-200/60",
        outline: "border border-slate-300 text-slate-700 bg-white/40",
        ghost: "text-slate-600 hover:bg-slate-200/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
