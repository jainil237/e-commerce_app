'use client';

import React from 'react';
import Link from 'next/link';

interface SharedBadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gray';
  className?: string;
}

export const SharedBadge: React.FC<SharedBadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const variantClass = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral',
    gray: 'badge-gray',
  }[variant] || 'badge-neutral';

  return (
    <span className={`badge ${variantClass} ${className}`}>
      {children}
    </span>
  );
};

interface SharedTableActionProps {
  children: React.ReactNode;
  className?: string;
}

export const SharedTableActionCell: React.FC<SharedTableActionProps> = ({ children, className = '' }) => {
  return (
    <td className={`text-center ${className}`}>
      <div className="flex items-center justify-center gap-1.5 min-h-[32px]">
        {children}
      </div>
    </td>
  );
};

interface SharedTableActionIconProps extends React.ButtonHTMLAttributes<HTMLButtonElement | HTMLAnchorElement> {
  icon: React.ReactNode;
  title?: string;
  variant?: 'default' | 'danger';
  href?: string;
}

export const SharedTableActionIcon: React.FC<SharedTableActionIconProps> = ({ 
  icon, 
  title, 
  variant = 'default', 
  href,
  className = '',
  ...props 
}) => {
  const baseClass = `p-2 rounded-lg transition-all flex items-center justify-center hover:scale-110 active:scale-95 ${
    variant === 'danger' 
      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]'
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={baseClass} title={title} {...(props as any)}>
        {icon && React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { size: 16 }) : null}
      </Link>
    );
  }

  return (
    <button className={baseClass} title={title} {...(props as any)}>
      {icon && React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, { size: 16 }) : null}
    </button>
  );
};

interface SharedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
}

export const SharedButton: React.FC<SharedButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading,
  className = '',
  disabled,
  ...props
}) => {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'hover:bg-[var(--surface-2)] text-[var(--text-secondary)]',
  }[variant] || 'btn-primary';

  const sizeClass = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg',
  }[size] || 'btn-md';

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className} ${isLoading || disabled ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && leftIcon && (
        <span className={children ? "mr-2" : ""}>{leftIcon}</span>
      )}
      {children}
      {!isLoading && rightIcon && (
        <span className={children ? "ml-2" : ""}>{rightIcon}</span>
      )}
    </button>
  );
};
