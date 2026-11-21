export interface CountryCodeOption {
  code: string;
  label: string;
  shortLabel: string;
}

export const WHATSAPP_COUNTRY_CODES: CountryCodeOption[] = [
  { code: '91', label: '+91 (India)', shortLabel: '+91 IN' },
  { code: '1', label: '+1 (US / Canada)', shortLabel: '+1 US' },
  { code: '44', label: '+44 (UK)', shortLabel: '+44 UK' },
  { code: '971', label: '+971 (UAE)', shortLabel: '+971 AE' },
  { code: '65', label: '+65 (Singapore)', shortLabel: '+65 SG' },
  { code: '61', label: '+61 (Australia)', shortLabel: '+61 AU' },
  { code: '49', label: '+49 (Germany)', shortLabel: '+49 DE' },
  { code: '', label: 'Other (+Intl)', shortLabel: '+ Intl' },
];

export interface NormalizedWhatsAppNumber {
  valid: boolean;
  e164Digits: string;
  formattedDisplay: string;
  error: string | null;
}

export function formatWhatsAppDisplay(e164Digits: string): string {
  if (!e164Digits) return '';
  if (e164Digits.startsWith('91') && e164Digits.length === 12) {
    return `+91 ${e164Digits.slice(2, 7)} ${e164Digits.slice(7)}`;
  }
  if (e164Digits.startsWith('1') && e164Digits.length === 11) {
    return `+1 (${e164Digits.slice(1, 4)}) ${e164Digits.slice(4, 7)}-${e164Digits.slice(7)}`;
  }
  return `+${e164Digits}`;
}

export function normalizeWhatsAppNumber(
  rawInput: string,
  countryCode: string = '91'
): NormalizedWhatsAppNumber {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      e164Digits: '',
      formattedDisplay: '',
      error: 'Enter the client mobile number.',
    };
  }

  const hasExplicitPlus = trimmed.startsWith('+');
  const hasDoubleZeroPrefix = trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) {
    return {
      valid: false,
      e164Digits: '',
      formattedDisplay: '',
      error: 'Enter digits for the client mobile number.',
    };
  }

  if (hasExplicitPlus || hasDoubleZeroPrefix) {
    if (hasDoubleZeroPrefix) {
      digits = digits.replace(/^00+/, '');
    }
    if (digits.length < 7 || digits.length > 15) {
      return {
        valid: false,
        e164Digits: digits,
        formattedDisplay: digits ? `+${digits}` : '',
        error: 'International mobile number must be 7 to 15 digits.',
      };
    }
    return {
      valid: true,
      e164Digits: digits,
      formattedDisplay: formatWhatsAppDisplay(digits),
      error: null,
    };
  }

  const localDigits = digits.replace(/^0+/, '');
  const cleanCode = countryCode.replace(/\D/g, '');

  if (!cleanCode) {
    if (localDigits.length < 7 || localDigits.length > 15) {
      return {
        valid: false,
        e164Digits: localDigits,
        formattedDisplay: localDigits ? `+${localDigits}` : '',
        error: 'Include the country code (7 to 15 digits total).',
      };
    }
    return {
      valid: true,
      e164Digits: localDigits,
      formattedDisplay: formatWhatsAppDisplay(localDigits),
      error: null,
    };
  }

  if (cleanCode === '91') {
    const e164 =
      localDigits.length === 12 && localDigits.startsWith('91')
        ? localDigits
        : `91${localDigits}`;

    if (e164.length !== 12) {
      return {
        valid: false,
        e164Digits: e164,
        formattedDisplay: formatWhatsAppDisplay(e164),
        error: 'Enter a valid 10-digit mobile number (or start with +country code).',
      };
    }

    return {
      valid: true,
      e164Digits: e164,
      formattedDisplay: formatWhatsAppDisplay(e164),
      error: null,
    };
  }

  const alreadyIncludesCode =
    localDigits.startsWith(cleanCode) &&
    localDigits.length >= cleanCode.length + 7 &&
    localDigits.length <= 15;

  const e164 = alreadyIncludesCode ? localDigits : `${cleanCode}${localDigits}`;

  if (e164.length < 7 || e164.length > 15) {
    return {
      valid: false,
      e164Digits: e164,
      formattedDisplay: formatWhatsAppDisplay(e164),
      error: 'Enter a valid mobile number (7 to 15 digits with country code).',
    };
  }

  return {
    valid: true,
    e164Digits: e164,
    formattedDisplay: formatWhatsAppDisplay(e164),
    error: null,
  };
}

export function buildWhatsAppSendUrl(e164Digits: string, message: string): string {
  const cleanDigits = e164Digits.replace(/\D/g, '');
  const cleanMessage = message.trim();
  const params = cleanMessage ? `?text=${encodeURIComponent(cleanMessage)}` : '';
  return `https://wa.me/${cleanDigits}${params}`;
}
