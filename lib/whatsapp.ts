/** Normalize a Pakistan mobile number to international digits (e.g. 923001234567). */
export function normalizePkPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  if (digits.startsWith('92') && digits.length >= 12) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length >= 11) {
    return `92${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `92${digits}`;
  }

  return digits.length >= 11 ? digits : null;
}

/** Build a wa.me deep link, or null if the phone cannot be normalized. */
export function whatsAppSendUrl(phone: string, message: string): string | null {
  const normalized = normalizePkPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
