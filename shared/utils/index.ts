export const formatCurrency = (value: string | number | null | undefined, currency: string = 'INR', locale: string = 'en-IN') => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `${currency === 'INR' ? '₹' : ''}0.00`;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString: string | null | undefined, locale: string = 'en-IN') => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getDiscountPercentage = (price: string | number, mrp: string | number) => {
  const p = Number(price);
  const m = Number(mrp);
  if (!m || p >= m) return 0;
  return Math.round((1 - p / m) * 100);
};

export const parseTags = (tags: string[] | string | undefined | null): string[] => {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
};

/**
 * Password strength rules, shared so the UI checklist and the submit-time guard
 * can never disagree about what "strong" means.
 *
 * Deliberately not applied at sign-in: an existing account's password must keep
 * working even if it predates these rules, and telling someone their password is
 * too weak while they are trying to log in helps an attacker, not them.
 */
export interface PasswordRule {
  id: string
  label: string
  test: (value: string) => boolean
}

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: v => v.length >= PASSWORD_MIN_LENGTH },
  { id: 'lower', label: 'One lowercase letter', test: v => /[a-z]/.test(v) },
  { id: 'upper', label: 'One uppercase letter', test: v => /[A-Z]/.test(v) },
  { id: 'number', label: 'One number', test: v => /\d/.test(v) },
  { id: 'symbol', label: 'One symbol', test: v => /[^A-Za-z0-9]/.test(v) },
]

export interface PasswordCheck {
  valid: boolean
  /** Rules not yet satisfied, in the order they are shown to the user. */
  failed: PasswordRule[]
  /** 0–5, for a strength indicator. */
  score: number
}

export const checkPassword = (value: string): PasswordCheck => {
  const failed = PASSWORD_RULES.filter(rule => !rule.test(value))
  return {
    valid: failed.length === 0,
    failed,
    score: PASSWORD_RULES.length - failed.length,
  }
}
