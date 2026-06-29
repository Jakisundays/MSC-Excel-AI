/** Validación de email (misma regex que usaba el Streamlit). */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function invalidEmails(emails: string[]): string[] {
  return emails.filter((e) => !isValidEmail(e));
}
