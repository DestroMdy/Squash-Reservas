import Image from "next/image";

type AvatarImageProps = {
  src?: string | null;
  alt: string;
  size: number;
  className?: string;
  priority?: boolean;
};

export function AvatarImage({
  src,
  alt,
  size,
  className,
  priority = false
}: AvatarImageProps) {
  return (
    <Image
      src={src || "/icon-192.png"}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      className={className}
    />
  );
}
