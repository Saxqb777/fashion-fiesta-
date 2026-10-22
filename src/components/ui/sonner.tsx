"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-leaf" />,
        info: <InfoIcon className="size-4 text-sky" />,
        warning: <TriangleAlertIcon className="size-4 text-sun" />,
        error: <OctagonXIcon className="size-4 text-brand" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "14px",
          fontFamily: "var(--font-manrope)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
