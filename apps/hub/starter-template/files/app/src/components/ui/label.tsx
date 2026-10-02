/*
 * shadcn/ui (https://github.com/shadcn-ui/ui), MIT License, Copyright (c) 2023 shadcn.
 * Generated with shadcn 4.21.0, style "base-nova". The license text is in LICENSE-shadcn-ui.txt.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
