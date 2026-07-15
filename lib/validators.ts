/** Validación de email (misma regex que usaba el Streamlit). */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function invalidEmails(emails: string[]): string[] {
  return emails.filter((e) => !isValidEmail(e));
}

/** Política de contraseña para el registro self-service (app/api/auth/register).
 * Más estricta que el `min: 8` de PocketBase a nivel schema, ya que sin
 * verificación de email esta es la barrera de seguridad principal. */
export const PASSWORD_MIN_LENGTH = 10;
// bcrypt trunca en 72 bytes -- mejor rechazar que darle al usuario una
// falsa sensación de fortaleza con algo que se corta en silencio al hashear.
const PASSWORD_MAX_LENGTH = 72;

export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[a-zA-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}
