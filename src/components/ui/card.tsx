"use client";

import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm dark:shadow-lg overflow-hidden",
        className,
      ].join(" ").trim()}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={["p-6 border-b border-zinc-100 dark:border-zinc-700", className].join(" ").trim()}>
      {children}
    </div>
  );
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={["p-6", className].join(" ").trim()}>{children}</div>;
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: "bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-white",
    success: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
    danger: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  };
  return (
    <span
      {...props}
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      ].join(" ").trim()}
    />
  );
}
