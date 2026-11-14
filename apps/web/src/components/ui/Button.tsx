import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Tooltip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface-3 text-fg hover:bg-border',
  outline: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90 dark:text-[#2a0d09]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leading?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leading, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {leading}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'ghost' | 'outline' | 'primary' | 'danger';
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'right';
  shortcut?: string | undefined;
}

const iconSizes = { xs: 'size-7 rounded-md', sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl' };
const iconVariants = {
  ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  outline: 'border border-border bg-surface text-fg-muted hover:text-fg hover:bg-surface-2',
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  danger: 'bg-danger text-white dark:text-[#2a0d09] hover:opacity-90',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'sm', variant = 'ghost', tooltip = true, tooltipSide = 'top', shortcut, className, children, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        iconSizes[size],
        iconVariants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip ? (
    <Tooltip label={label} side={tooltipSide} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  );
});
