interface Props {
  attrs: Record<string, string>;
}

export function YoutubeEmbed({ attrs }: Props) {
  const videoId = attrs.videoId;
  if (!videoId || !/^[\w-]{1,20}$/.test(videoId)) return null;

  return (
    <div className="youtube-embed my-6 aspect-video overflow-hidden rounded-lg">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
