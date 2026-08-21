import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Pipe({ name: 'safeUrl', standalone: true })
export class SafeUrlPipe implements PipeTransform {
  private static readonly INTERNAL_VIDEO_PATH = '/api/VideoUnidad/stream';
  private static readonly ALLOWED_APPLICATION_HOSTS = new Set(['srvdockergusof.policia.gov.co']);

  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeResourceUrl {
    const resourceUrl = this.normalizeResourceUrl(value);
    return this.sanitizer.bypassSecurityTrustResourceUrl(resourceUrl);
  }

  /**
   * Convierte enlaces públicos de YouTube a /embed y rechaza cualquier origen
   * que no pertenezca a la lista blanca del reproductor.
   */
  private normalizeResourceUrl(value: string | null | undefined): string {
    const rawUrl = String(value ?? '').trim();
    if (!rawUrl) {
      return 'about:blank';
    }

    if (rawUrl.startsWith(SafeUrlPipe.INTERNAL_VIDEO_PATH)) {
      return rawUrl;
    }

    try {
      const url = new URL(rawUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'about:blank';
      }

      if (SafeUrlPipe.ALLOWED_APPLICATION_HOSTS.has(url.hostname)) {
        return url.toString();
      }

      const youtubeEmbed = this.toYoutubeEmbedUrl(url);
      if (youtubeEmbed) {
        return youtubeEmbed;
      }

      if (url.protocol === 'https:' && url.hostname === 'player.vimeo.com') {
        return url.pathname.startsWith('/video/') ? url.toString() : 'about:blank';
      }
    } catch {
      return 'about:blank';
    }

    return 'about:blank';
  }

  private toYoutubeEmbedUrl(url: URL): string | null {
    if (url.protocol !== 'https:') {
      return null;
    }

    let videoId = '';
    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
    } else if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v') ?? '';
      } else {
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'embed' || pathParts[0] === 'shorts') {
          videoId = pathParts[1] ?? '';
        }
      }
    }

    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return null;
    }

    return `https://www.youtube.com/embed/${videoId}`;
  }
}
