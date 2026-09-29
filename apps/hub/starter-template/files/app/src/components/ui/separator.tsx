/*
 * shadcn/ui (https://github.com/shadcn-ui/ui), MIT License, Copyright (c) 2023 shadcn.
 * Generated with shadcn 4.21.0, style "base-nova". The license text is in LICENSE-shadcn-ui.txt.
 */
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
