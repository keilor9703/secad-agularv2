import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Pipe({ name: 'safeUrl', standalone: true })
export class SafeUrlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(url: string): SafeResourceUrl {
    const rawUrl = String(url || '').trim();
    let finalUrl = 'about:blank';

    // Lista blanca estricta de dominios permitidos
    const trustedDomains = [
      'https://srvdockergusof.policia.gov.co',
      'http://srvdockergusof.policia.gov.co',
      'https://www.youtube.com',
      'https://player.vimeo.com'
    ];

    if (rawUrl) {
      const isTrustedDomain = trustedDomains.some(domain => rawUrl.startsWith(domain));
      const isInternalStream = rawUrl.startsWith('/api/VideoUnidad/stream');

      if (isTrustedDomain || isInternalStream) {
        const preSanitized = this.sanitizer.sanitize(SecurityContext.URL, rawUrl);
        finalUrl = preSanitized || rawUrl;
      } else {
        console.warn('[Security] Bloqueada URL de origen no confiable:', rawUrl);
      }
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(finalUrl);
  }
}
