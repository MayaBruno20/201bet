'use client';

type EventBannerProps = {
  url: string | null | undefined;
  alt?: string;
  className?: string;
  /** Quando true, o vídeo roda em modo "background" (autoplay, loop, mudo, sem controles). Default: true. */
  background?: boolean;
};

type ParsedMedia =
  | { kind: 'image'; src: string }
  | { kind: 'vimeo'; src: string }
  | { kind: 'youtube'; src: string }
  | { kind: 'video'; src: string }
  | null;

/**
 * Detecta se a URL é Vimeo, YouTube, vídeo direto (.mp4/.webm) ou imagem.
 */
export function parseBannerUrl(url: string | null | undefined, background = true): ParsedMedia {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Vimeo: https://vimeo.com/<id>  ou  https://vimeo.com/<id>/<hash>
  const vimeoMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/i,
  );
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    const hash = vimeoMatch[2];
    const params = new URLSearchParams();
    if (hash) params.set('h', hash);
    if (background) {
      params.set('background', '1');
      params.set('autoplay', '1');
      params.set('loop', '1');
      params.set('muted', '1');
      params.set('autopause', '0');
    } else {
      params.set('autoplay', '1');
      params.set('muted', '1');
    }
    params.set('dnt', '1');
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}?${params.toString()}` };
  }

  // YouTube: https://youtu.be/<id>  ou  https://www.youtube.com/watch?v=<id>  ou  /embed/<id>
  const ytMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  );
  if (ytMatch) {
    const id = ytMatch[1];
    const params = new URLSearchParams();
    params.set('autoplay', '1');
    params.set('mute', '1');
    params.set('controls', background ? '0' : '1');
    params.set('loop', '1');
    params.set('playlist', id);
    params.set('playsinline', '1');
    params.set('modestbranding', '1');
    params.set('rel', '0');
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}` };
  }

  // Vídeo direto (.mp4, .webm, .mov)
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(trimmed)) {
    return { kind: 'video', src: trimmed };
  }

  // Imagem (default)
  return { kind: 'image', src: trimmed };
}

export function isVideoBanner(url: string | null | undefined) {
  const parsed = parseBannerUrl(url);
  return !!parsed && parsed.kind !== 'image';
}

export function EventBanner({ url, alt = '', className = '', background = true }: EventBannerProps) {
  const parsed = parseBannerUrl(url, background);
  if (!parsed) return null;

  if (parsed.kind === 'image') {
    return <img src={parsed.src} alt={alt} className={className || 'w-full h-full object-cover'} />;
  }

  if (parsed.kind === 'video') {
    return (
      <video
        src={parsed.src}
        autoPlay
        loop
        muted
        playsInline
        className={className || 'w-full h-full object-cover'}
      />
    );
  }

  // Vimeo / YouTube — usa wrapper que cobre o container e iframe pointer-events-none em background
  // para não interceptar cliques do card pai.
  return (
    <div className={className || 'absolute inset-0 w-full h-full overflow-hidden'}>
      <iframe
        src={parsed.src}
        title={alt}
        allow='autoplay; fullscreen; picture-in-picture'
        allowFullScreen
        loading='lazy'
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
          background ? 'pointer-events-none' : ''
        }`}
        // Vimeo background recomenda 16:9 cobrindo 100% maior dimensão
        style={{
          width: '177.77vh',
          minWidth: '100%',
          height: '56.25vw',
          minHeight: '100%',
          border: 0,
        }}
      />
    </div>
  );
}
