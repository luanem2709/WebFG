"use client";

import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
}

const variants: Record<string, string> = {
  primary: "bg-[#ff6b6b] text-white hover:bg-[#ff5252] active:bg-[#e54e4e]",
  secondary: "bg-[#4ecdc4] text-white hover:bg-[#45b7aa] active:bg-[#3ca08c]",
  outline:
    "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800",
  ghost: "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white",
  danger: "bg-[#ff4d4d] text-white hover:bg-[#e04343] active:bg-[#c43a3a]",
};

const sizes: Record<string, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-8 py-3 text-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, children, ...props }, ref) => {
    const mergedClassName = [
      "inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
      variants[variant || "primary"],
      sizes[size || "md"],
      className,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (asChild && React.isValidElement(children)) {
      const childElement = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(childElement, {
        ...props,
        className: [mergedClassName, childElement.props.className].filter(Boolean).join(" ").trim(),
      });
    }

    return (
      <button ref={ref} className={mergedClassName} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
