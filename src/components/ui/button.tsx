import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 outline-none select-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/25 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-deep",
        outline: "border-line bg-surface text-ink hover:bg-paper-deep aria-expanded:bg-paper-deep",
        secondary: "bg-paper-deep text-ink hover:bg-[#ece5db] aria-expanded:bg-[#ece5db]",
        ghost: "text-ink hover:bg-paper-deep aria-expanded:bg-paper-deep",
        destructive:
          "bg-brand-deep/10 text-brand-deep hover:bg-brand-deep/15 focus-visible:border-brand-deep/40 focus-visible:ring-brand-deep/20",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 gap-2 px-4",
        xs: "h-7 gap-1 rounded-[8px] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 text-[0.8125rem]",
        lg: "h-12 gap-2 px-5 text-base",
        icon: "size-11",
        "icon-xs": "size-7 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

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
  );
}

export { Button, buttonVariants };
