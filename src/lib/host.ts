export function getCurrentUdemyHost(): string {
  return window.location.hostname;
}

export function normalizeCookieSourceDomain(domain: string): string {
  return domain.replace(/^\./, '');
}
