const SQL_INJECTION_PATTERN =
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE|TRUNCATE|DECLARE|CAST|CONVERT)\b|--|;|'|"|\|\||\/\*|\*\/|xp_)/i;

const XSS_PATTERN = /<script|javascript:|on\w+\s*=|<iframe|<object|<embed/i;

export function sanitizeText(value: string, maxLength = 500): string {
  return value
    .replace(/[\0\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function assertSafeText(value: string, field = "Campo"): string {
  const clean = sanitizeText(value);
  if (!clean) throw new Error(`${field} no puede estar vacío`);
  if (SQL_INJECTION_PATTERN.test(clean)) {
    throw new Error(`${field} contiene caracteres no permitidos`);
  }
  if (XSS_PATTERN.test(clean)) {
    throw new Error(`${field} contiene contenido no permitido`);
  }
  return clean;
}

export function assertSafeEmail(value: string): string {
  const email = sanitizeText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Correo electrónico inválido");
  }
  if (SQL_INJECTION_PATTERN.test(email)) {
    throw new Error("Correo electrónico inválido");
  }
  return email;
}

export function assertSafePhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (digits.length < 7) throw new Error("Teléfono inválido (mínimo 7 dígitos)");
  return digits;
}

export function assertSafeDocumentId(value: string): string {
  const doc = sanitizeText(value, 20).replace(/\s/g, "");
  if (doc.length < 4) throw new Error("Cédula inválida (mínimo 4 caracteres)");
  if (!/^[a-zA-Z0-9.-]+$/.test(doc)) {
    throw new Error("Cédula contiene caracteres no permitidos");
  }
  return doc;
}
