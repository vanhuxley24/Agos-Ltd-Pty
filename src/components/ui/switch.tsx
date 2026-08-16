import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default" | "lg"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full transition-all duration-200 outline-none cursor-pointer select-none",
        "neo-inset-deep",
        "data-[size=default]:h-8 data-[size=default]:w-14 data-[size=default]:p-1",
        "data-[size=sm]:h-6 data-[size=sm]:w-11 data-[size=sm]:p-0.5",
        "data-[size=lg]:h-10 data-[size=lg]:w-18 data-[size=lg]:p-1.5",
        "data-checked:bg-blue-500/20 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full transition-all duration-200",
          "bg-[#EBF0F6] neo-flat-sm border border-white/80",
          "group-data-[size=default]/switch:size-6",
          "group-data-[size=sm]/switch:size-5",
          "group-data-[size=lg]/switch:size-7",
          "group-data-[size=default]/switch:data-checked:translate-x-6 group-data-[size=default]/switch:data-checked:bg-blue-600 group-data-[size=default]/switch:data-checked:shadow-[0_2px_8px_rgba(37,99,235,0.5)]",
          "group-data-[size=sm]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:bg-blue-600",
          "group-data-[size=lg]/switch:data-checked:translate-x-8 group-data-[size=lg]/switch:data-checked:bg-blue-600",
          "group-data-[size=default]/switch:data-unchecked:translate-x-0",
          "group-data-[size=sm]/switch:data-unchecked:translate-x-0",
          "group-data-[size=lg]/switch:data-unchecked:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
