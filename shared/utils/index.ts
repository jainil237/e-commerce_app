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
