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

interface SharedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const SharedModal: React.FC<SharedModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
}) => {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      // Store the active element to restore later
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Disable body scroll when modal is open
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Find first focusable element and focus it
      if (modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
        );
        if (focusableElements.length > 0) {
          (focusableElements[0] as HTMLElement).focus();
        } else {
          modalRef.current.focus();
        }
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusableElements = Array.from(
            modalRef.current.querySelectorAll<HTMLElement>(
              'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
            )
          );
          
          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey) {
            // Shift + Tab -> loop to last element if on first
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            // Tab -> loop to first element if on last
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = originalOverflow;
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-[var(--surface-0)] border border-[var(--border-base)] shadow-2xl rounded-3xl p-6 w-full max-w-md focus:outline-none animate-scale-in relative"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 id="modal-title" className="text-xl font-black text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-full hover:bg-[var(--surface-2)] transition-colors focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
